import { describe, expect, it } from 'vitest';
import { getDocumentationPageUrls } from '../../server/src/doc-pages';
import { getDocumentationLinkUrl } from '../../server/src/style-doc-links';

describe('getDocumentationPageUrls', () => {
  it('includes verified command and style pages only', () => {
    const urls = getDocumentationPageUrls('https://sparta.github.io/doc');
    expect(urls).toContain('https://sparta.github.io/doc/read_surf.html');
    expect(urls).toContain('https://sparta.github.io/doc/create_box.html');
    expect(urls).toContain('https://sparta.github.io/doc/fix_adapt.html');
    expect(urls.some((url) => url.endsWith('/vss.html'))).toBe(false);
    expect(urls.some((url) => url.endsWith('/diffuse.html'))).toBe(false);
  });
});

describe('verified style doc slugs', () => {
  it('maps adsorb to surf_react_adsorb', () => {
    expect(getDocumentationLinkUrl('adsorb', 'https://sparta.github.io/doc')).toBe(
      'https://sparta.github.io/doc/surf_react_adsorb.html'
    );
  });
});
