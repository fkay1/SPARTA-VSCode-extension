import { describe, expect, it } from 'vitest';
import { lexDocument, mergeLogicalLines, stripComment, tokenizeLine, unwrapQuotedCommandLine } from '../../server/src/lexer';

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

  it('unwraps quoted command lines', () => {
    const line = `"variable args string '-quarter --cutoff 1e-6' "`;
    expect(unwrapQuotedCommandLine(line)).toBe(`variable args string '-quarter --cutoff 1e-6' `);
    const { tokens } = tokenizeLine(line);
    expect(tokens.map((t) => t.text)).toEqual([
      'variable',
      'args',
      'string',
      '-quarter --cutoff 1e-6',
    ]);
  });

  it('leaves normal quoted strings unchanged', () => {
    const line = 'print "hello world"';
    expect(unwrapQuotedCommandLine(line)).toBe(line);
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
