import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { ArgContext, getFileRule } from '../file-args';

const MAX_RESULTS = 50;

export function providePathCompletions(
  ctx: ArgContext,
  workspaceRoots: string[],
  documentDir: string | null
): CompletionItem[] {
  const rule = getFileRule(ctx);
  if (!rule) {
    return [];
  }

  const searchDirs = uniqueDirs([
    ...(documentDir ? [documentDir] : []),
    ...workspaceRoots,
  ]);

  const partial = ctx.partial.toLowerCase();
  const matches: CompletionItem[] = [];
  const seen = new Set<string>();

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) {
      continue;
    }
    collectFiles(dir, dir, rule.extensions, partial, matches, seen);
    if (matches.length >= MAX_RESULTS) {
      break;
    }
  }

  return matches.slice(0, MAX_RESULTS);
}

function uniqueDirs(dirs: string[]): string[] {
  return [...new Set(dirs.map((d) => path.normalize(d)))];
}

function collectFiles(
  root: string,
  dir: string,
  extensions: string[] | undefined,
  partial: string,
  out: CompletionItem[],
  seen: Set<string>,
  depth = 0
): void {
  if (depth > 3 || out.length >= MAX_RESULTS) {
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(root, full, extensions, partial, out, seen, depth + 1);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const rel = path.relative(root, full).replace(/\\/g, '/');
    const base = entry.name.toLowerCase();
    if (partial && !base.startsWith(partial) && !rel.toLowerCase().startsWith(partial)) {
      continue;
    }
    if (extensions && extensions.length > 0) {
      const ext = path.extname(entry.name).toLowerCase();
      const baseName = entry.name.toLowerCase();
      const matchesExt =
        extensions.some((e) => baseName.endsWith(e.toLowerCase())) ||
        extensions.some((e) => ext === e.toLowerCase()) ||
        (extensions.includes('.surf') && !ext && baseName.startsWith('data.')) ||
        (extensions.includes('.grid') && baseName.includes('.grid'));
      if (!matchesExt) {
        continue;
      }
    }

    if (seen.has(rel)) {
      continue;
    }
    seen.add(rel);

    out.push({
      label: rel,
      kind: CompletionItemKind.File,
      detail: path.basename(full),
      sortText: `0_${rel}`,
      insertText: rel.includes(' ') ? `"${rel}"` : rel,
    });
  }
}

export function documentDirFromUri(uri: string): string | null {
  if (!uri.startsWith('file://')) {
    return null;
  }
  try {
    return path.dirname(fileURLToPath(uri));
  } catch {
    return null;
  }
}
