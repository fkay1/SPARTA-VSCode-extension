import * as fs from 'fs/promises';
import * as path from 'path';
import {
  commands,
  ExtensionContext,
  Uri,
  ViewColumn,
  WebviewPanel,
  window,
  workspace,
} from 'vscode';
import { injectBaseHref, slugFromDocUrl } from './doc-html';

interface CacheEntry {
  fetchedAt: number;
  url: string;
}

type CacheMeta = Record<string, CacheEntry>;

let docPanel: WebviewPanel | undefined;

export class DocCache {
  private readonly cacheDir: string;
  private readonly metaPath: string;
  private prefetchPromise: Promise<void> | undefined;
  private readonly htmlBySlug = new Map<string, string>();
  private metaCache: CacheMeta | null = null;

  constructor(context: ExtensionContext) {
    this.cacheDir = path.join(context.globalStorageUri.fsPath, 'docs');
    this.metaPath = path.join(this.cacheDir, 'meta.json');
  }

  isEnabled(): boolean {
    return workspace.getConfiguration('sparta').get('cacheDocumentation', true);
  }

  private maxAgeMs(): number {
    const days = workspace.getConfiguration('sparta').get('docCacheMaxAgeDays', 7);
    return Math.max(1, days) * 24 * 60 * 60 * 1000;
  }

  private docBaseUrl(): string {
    return workspace.getConfiguration('sparta').get('docBaseUrl', 'https://sparta.github.io/doc');
  }

  private cachePathForSlug(slug: string): string {
    return path.join(this.cacheDir, `${slug}.html`);
  }

  private async ensureReady(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  private async loadMetaFromDisk(): Promise<CacheMeta> {
    try {
      const raw = await fs.readFile(this.metaPath, 'utf8');
      return JSON.parse(raw) as CacheMeta;
    } catch {
      return {};
    }
  }

  private async getMeta(): Promise<CacheMeta> {
    if (!this.metaCache) {
      this.metaCache = await this.loadMetaFromDisk();
    }
    return this.metaCache;
  }

  private async saveMeta(meta: CacheMeta): Promise<void> {
    this.metaCache = meta;
    await fs.writeFile(this.metaPath, JSON.stringify(meta), 'utf8');
  }

  private isFreshEntry(entry: CacheEntry | undefined): boolean {
    if (!entry) {
      return false;
    }
    return Date.now() - entry.fetchedAt < this.maxAgeMs();
  }

  /** Load previously cached pages from disk into memory for instant opens. */
  async warmupMemoryCache(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.ensureReady();
    const meta = await this.getMeta();
    await Promise.all(
      Object.keys(meta).map(async (slug) => {
        if (this.htmlBySlug.has(slug) || !this.isFreshEntry(meta[slug])) {
          return;
        }
        try {
          const html = await fs.readFile(this.cachePathForSlug(slug), 'utf8');
          this.htmlBySlug.set(slug, html);
        } catch {
          // Ignore missing or unreadable cache files.
        }
      })
    );
  }

  getCachedHtmlSync(url: string): string | undefined {
    return this.htmlBySlug.get(slugFromDocUrl(url));
  }

  async fetchAndCache(url: string): Promise<string> {
    await this.ensureReady();
    const slug = slugFromDocUrl(url);
    const cachePath = this.cachePathForSlug(slug);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    const html = injectBaseHref(await response.text(), this.docBaseUrl());
    this.htmlBySlug.set(slug, html);
    await fs.writeFile(cachePath, html, 'utf8');

    const meta = await this.getMeta();
    meta[slug] = { fetchedAt: Date.now(), url };
    await this.saveMeta(meta);

    return cachePath;
  }

  async getCachedHtml(url: string): Promise<string | undefined> {
    if (!this.isEnabled()) {
      return undefined;
    }

    const slug = slugFromDocUrl(url);
    const cached = this.htmlBySlug.get(slug);
    if (cached) {
      return cached;
    }

    const meta = await this.getMeta();
    if (!this.isFreshEntry(meta[slug])) {
      return undefined;
    }

    try {
      const html = await fs.readFile(this.cachePathForSlug(slug), 'utf8');
      this.htmlBySlug.set(slug, html);
      return html;
    } catch {
      return undefined;
    }
  }

  async resolveCachedHtml(url: string): Promise<string | undefined> {
    const cached = await this.getCachedHtml(url);
    if (cached) {
      return cached;
    }

    try {
      await this.fetchAndCache(url);
      return this.htmlBySlug.get(slugFromDocUrl(url));
    } catch {
      return undefined;
    }
  }

  async prefetchAll(urls: string[], force = false): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.ensureReady();
    const meta = await this.getMeta();
    const toFetch = force
      ? urls
      : urls.filter((url) => {
          const slug = slugFromDocUrl(url);
          if (this.htmlBySlug.has(slug)) {
            return false;
          }
          const entry = meta[slug];
          return !entry || Date.now() - entry.fetchedAt >= this.maxAgeMs();
        });

    const concurrency = 6;
    let index = 0;

    const worker = async (): Promise<void> => {
      while (index < toFetch.length) {
        const url = toFetch[index++];
        try {
          await this.fetchAndCache(url);
        } catch {
          // Skip pages that fail; on-demand open will retry or fall back online.
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, toFetch.length) }, worker));
  }

  startBackgroundPrefetch(getUrls: () => Promise<string[]>): void {
    if (!this.isEnabled() || this.prefetchPromise) {
      return;
    }

    void this.warmupMemoryCache();

    this.prefetchPromise = getUrls()
      .then((urls) => this.prefetchAll(urls))
      .then(() => this.warmupMemoryCache())
      .catch(() => undefined);
  }

  async refresh(getUrls: () => Promise<string[]>): Promise<void> {
    this.htmlBySlug.clear();
    this.metaCache = null;
    const urls = await getUrls();
    await this.prefetchAll(urls, true);
    await this.warmupMemoryCache();
  }
}

function showDocPanel(slug: string, html: string): void {
  if (docPanel) {
    docPanel.title = `SPARTA: ${slug}`;
    docPanel.webview.html = html;
    docPanel.reveal(ViewColumn.Beside);
    return;
  }

  docPanel = window.createWebviewPanel(
    'spartaDoc',
    `SPARTA: ${slug}`,
    ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  docPanel.webview.html = html;
  docPanel.onDidDispose(() => {
    docPanel = undefined;
  });
}

export function openDocumentationPage(url: string, cache: DocCache): void {
  const slug = slugFromDocUrl(url);
  const cachedHtml = cache.getCachedHtmlSync(url);
  if (cachedHtml) {
    showDocPanel(slug, cachedHtml);
    return;
  }

  void (async () => {
    const html = await cache.resolveCachedHtml(url);
    if (html) {
      showDocPanel(slug, html);
      return;
    }

    try {
      await commandsExecuteSimpleBrowser(url);
    } catch {
      window.showErrorMessage(`Could not open SPARTA documentation: ${url}`);
    }
  })();
}

async function commandsExecuteSimpleBrowser(url: string): Promise<void> {
  try {
    await commands.executeCommand('simpleBrowser.api.open', Uri.parse(url), {
      viewColumn: ViewColumn.Beside,
    });
  } catch {
    await commands.executeCommand('simpleBrowser.show', url);
  }
}
