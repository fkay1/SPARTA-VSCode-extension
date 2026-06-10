import * as path from 'path';

/** Inject a base href so cached pages still load CSS/images from the live manual. */
export function injectBaseHref(html: string, baseUrl: string): string {
  const normalized = baseUrl.replace(/\/?$/, '/');
  const baseTag = `<base href="${normalized}">`;
  if (/<base\s/i.test(html)) {
    return html;
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}`);
  }
  return `<head>${baseTag}</head>\n${html}`;
}

export function slugFromDocUrl(url: string): string {
  const { pathname } = new URL(url);
  return path.basename(pathname, '.html');
}
