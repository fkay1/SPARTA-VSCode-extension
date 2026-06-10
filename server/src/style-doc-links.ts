import verifiedDocPages from './schema/verified-doc-pages.json';
import { docPageUrl } from './doc-markdown';

const COMMAND_PAGES = new Set<string>(verifiedDocPages.commands);
const STYLE_PAGES = verifiedDocPages.styles as Record<string, string>;

/** Manual page URL for cmd+click links; only returns URLs with verified pages. */
export function getDocumentationLinkUrl(word: string, docBaseUrl: string): string | null {
  if (COMMAND_PAGES.has(word)) {
    return docPageUrl(docBaseUrl, word);
  }

  const styleSlug = STYLE_PAGES[word];
  if (styleSlug) {
    return docPageUrl(docBaseUrl, styleSlug);
  }

  return null;
}

export function hasDocumentationPage(word: string): boolean {
  return COMMAND_PAGES.has(word) || word in STYLE_PAGES;
}

export function getVerifiedStyleSlugs(): Readonly<Record<string, string>> {
  return STYLE_PAGES;
}

export function getVerifiedCommandNames(): readonly string[] {
  return verifiedDocPages.commands;
}
