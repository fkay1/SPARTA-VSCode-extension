import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../server/src/parser';
import { mergeLogicalLines } from '../../server/src/lexer';
import { provideCompletions } from '../../server/src/providers/completion';
import { CompletionItemKind } from 'vscode-languageserver';

function parse(src: string) {
  const { lines } = mergeLogicalLines(src);
  return parseDocument(lines, true);
}

describe('parser diagnostics', () => {
  it('flags unknown command', () => {
    const { diagnostics } = parse('foo bar');
    expect(diagnostics.some((d) => d.code === 'sparta/parse/unknown-command')).toBe(true);
  });

  it('flags create_grid before create_box', () => {
    const { diagnostics } = parse('create_grid 10 10 1\ncreate_box 0 10 0 10 -0.5 0.5');
    expect(diagnostics.some((d) => d.code === 'sparta/order/box-required')).toBe(true);
  });

  it('flags read_surf before grid', () => {
    const src = `create_box 0 10 0 10 -0.5 0.5
read_surf data.circle
create_grid 10 10 1`;
    const { diagnostics } = parse(src);
    expect(diagnostics.some((d) => d.code === 'sparta/order/grid-required')).toBe(true);
  });

  it('accepts valid minimal ordering', () => {
    const src = `create_box 0 10 0 10 -0.5 0.5
create_grid 10 10 1
species air.species N O
run 100`;
    const { diagnostics } = parse(src);
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });
});

describe('completion', () => {
  it('offers species arg snippet when command fully typed', () => {
    const items = provideCompletions({
      linePrefix: 'species',
      prefix: 'species',
      prefixStart: 0,
      character: 7,
    });
    const snippet = items.find((i) => i.kind === CompletionItemKind.Snippet);
    expect(snippet).toBeDefined();
    expect(snippet?.textEdit?.newText).toMatch(/^species \$\{1:air\.species\}/);
  });

  it('uses Keyword kind for commands', () => {
    const items = provideCompletions({
      linePrefix: 'sp',
      prefix: 'sp',
      prefixStart: 0,
      character: 2,
    });
    const species = items.find((i) => i.label === 'species');
    expect(species?.kind).toBe(CompletionItemKind.Keyword);
  });

  it('offers args-only snippet after "species "', () => {
    const items = provideCompletions({
      linePrefix: 'species ',
      prefix: '',
      prefixStart: 8,
      character: 8,
    });
    const snippet = items.find((i) => i.kind === CompletionItemKind.Snippet);
    expect(snippet?.textEdit?.newText).toBe('${1:air.species} ${2:N} ${3:O}');
    expect(snippet?.textEdit?.newText).not.toMatch(/^species/);
  });
});
