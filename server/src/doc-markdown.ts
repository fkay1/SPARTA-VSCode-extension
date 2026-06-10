/** Escape characters that would break Markdown rendering in hover tooltips. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');
}

/** Build a SPARTA manual page URL from the configured base URL and page slug. */
export function docPageUrl(baseUrl: string, slug: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const docBase = base.endsWith('/doc') ? base : `${base}/doc`;
  return `${docBase}/${slug}.html`;
}

/** Convert raw SPARTA doc text into readable plain text for hover tooltips. */
export function plainDocText(raw: string, maxLen = 500): string {
  const text = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/:line\n/g, '\n')
    .replace(/:pre\n/g, '\n')
    .replace(/:ulb,l\n/g, '\n')
    .replace(/:ule\n/g, '\n')
    .replace(/:l\n/g, '\n')
    .replace(/"([^"]+)"_[^\s\n]+/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const para = text.split(/\n\s*\n/)[0]?.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
  if (!para) {
    return '';
  }
  if (para.length <= maxLen) {
    return para;
  }

  const slice = para.slice(0, maxLen);
  const lastPeriod = slice.lastIndexOf('. ');
  if (lastPeriod >= 0) {
    return slice.slice(0, lastPeriod + 1);
  }
  return `${slice.trimEnd()}…`;
}
