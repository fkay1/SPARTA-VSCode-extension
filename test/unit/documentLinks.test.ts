import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  buildOpenDocCommandUri,
  provideDocumentLinks,
} from '../../server/src/providers/documentLinks';
import { getDocumentationLinkUrl } from '../../server/src/style-doc-links';

describe('style doc links', () => {
  const baseUrl = 'https://sparta.github.io/doc';

  it('links fix styles with their own manual pages', () => {
    expect(getDocumentationLinkUrl('adapt', baseUrl)).toBe(
      `${baseUrl}/fix_adapt.html`
    );
  });

  it('does not link styles without a dedicated manual page', () => {
    expect(getDocumentationLinkUrl('vss', baseUrl)).toBeNull();
    expect(getDocumentationLinkUrl('diffuse', baseUrl)).toBeNull();
    expect(getDocumentationLinkUrl('block', baseUrl)).toBeNull();
  });

  it('links commands with manual pages', () => {
    expect(getDocumentationLinkUrl('read_surf', baseUrl)).toBe(
      `${baseUrl}/read_surf.html`
    );
  });
});

describe('documentLinks', () => {
  it('builds a command URI for opening documentation', () => {
    const uri = buildOpenDocCommandUri('https://sparta.github.io/doc/read_surf.html');
    expect(uri.startsWith('command:sparta.openDoc?')).toBe(true);
    expect(decodeURIComponent(uri)).toContain('read_surf.html');
  });

  it('links command words in a script line', () => {
    const doc = TextDocument.create('file:///in.test', 'sparta', 1, 'read_surf data.surf');
    const links = provideDocumentLinks(doc, 'https://sparta.github.io/doc');
    const readSurf = links.find((link) =>
      doc.getText(link.range).includes('read_surf')
    );
    expect(readSurf).toBeDefined();
    expect(readSurf?.target).toContain('read_surf.html');
  });

  it('does not link styles without dedicated manual pages', () => {
    const doc = TextDocument.create(
      'file:///in.test',
      'sparta',
      1,
      'collide air vss air.vss'
    );
    const links = provideDocumentLinks(doc, 'https://sparta.github.io/doc');
    expect(links.some((link) => doc.getText(link.range) === 'vss')).toBe(false);
  });

  it('does not link words without documentation', () => {
    const doc = TextDocument.create('file:///in.test', 'sparta', 1, 'foo bar');
    const links = provideDocumentLinks(doc, 'https://sparta.github.io/doc');
    expect(links).toHaveLength(0);
  });
});
