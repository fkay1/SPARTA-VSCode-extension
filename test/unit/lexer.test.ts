import { describe, expect, it } from 'vitest';
import { lexDocument, mergeLogicalLines, stripComment, tokenizeLine } from '../../server/src/lexer';

describe('lexer', () => {
  it('strips comments outside quotes', () => {
    expect(stripComment('species air.species N O  # comment')).toBe('species air.species N O  ');
    expect(stripComment("print \"hello # world\"")).toBe('print "hello # world"');
  });

  it('merges & continuation lines', () => {
    const src = 'read_surf data.step trans 5 5 0 &\n  rotate 45 0 0 1';
    const { lines, diagnostics } = mergeLogicalLines(src);
    expect(diagnostics).toHaveLength(0);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain('rotate 45 0 0 1');
    expect(lines[0].startLine).toBe(0);
    expect(lines[0].endLine).toBe(1);
  });

  it('does not merge when # follows &', () => {
    const src = 'read_surf file &  # comment\nnext line';
    const { lines } = mergeLogicalLines(src);
    expect(lines).toHaveLength(2);
  });

  it('tokenizes quoted strings as single args', () => {
    const { tokens } = tokenizeLine('print "hello world"');
    expect(tokens.map((t) => t.text)).toEqual(['print', 'hello world']);
  });

  it('parses circle example without lexer errors', () => {
    const src = `# comment
seed 12345
dimension 2
create_box 0 10 0 10 -0.5 0.5
species air.species N O`;
    const { diagnostics } = lexDocument(src);
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });
});
