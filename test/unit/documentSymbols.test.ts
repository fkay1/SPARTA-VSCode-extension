import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { provideDocumentSymbols } from '../../server/src/providers/documentSymbols';

describe('documentSymbols', () => {
  it('groups commands into sections', () => {
    const src = `dimension 2
create_box 0 10 0 10 -0.5 0.5
create_grid 10 10 1
species air.species N O
run 1000`;

    const doc = TextDocument.create('file:///test.in', 'sparta', 1, src);
    const symbols = provideDocumentSymbols(doc);

    expect(symbols.map((s) => s.name)).toContain('Initialization');
    expect(symbols.map((s) => s.name)).toContain('Geometry');
    expect(symbols.map((s) => s.name)).toContain('Run');

    const runSection = symbols.find((s) => s.name === 'Run');
    expect(runSection?.children?.some((c) => c.name.startsWith('run'))).toBe(true);
  });
});
