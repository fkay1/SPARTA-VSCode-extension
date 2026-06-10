import { describe, expect, it } from 'vitest';
import { injectBaseHref, slugFromDocUrl } from '../../client/src/doc-html';

describe('doc-html', () => {
  it('extracts slug from documentation URL', () => {
    expect(slugFromDocUrl('https://sparta.github.io/doc/read_surf.html')).toBe('read_surf');
  });

  it('injects base href into HTML head', () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const out = injectBaseHref(html, 'https://sparta.github.io/doc');
    expect(out).toContain('<base href="https://sparta.github.io/doc/">');
  });

  it('does not duplicate an existing base tag', () => {
    const html = '<head><base href="https://example.com/"></head>';
    expect(injectBaseHref(html, 'https://sparta.github.io/doc')).toBe(html);
  });
});
