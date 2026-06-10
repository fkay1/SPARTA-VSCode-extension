import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseSyntaxBlock, normalizeCommandSyntax, resolvePositionalParameter } from '../../server/src/parse-syntax';
import { getLineArgStateAt } from '../../server/src/completion-stages';
import { provideArgHover } from '../../server/src/providers/argHover';

const docDir = path.resolve(__dirname, '../../../sparta/doc');

describe('parseSyntaxBlock', () => {
  it('parses create_box positional arguments', () => {
    const text = readFileSync(path.join(docDir, 'create_box.txt'), 'utf8');
    const syntaxBlock = text.slice(
      text.indexOf('[Syntax:]') + '[Syntax:]'.length,
      text.indexOf('[Examples:]')
    );
    const parsed = normalizeCommandSyntax('create_box', parseSyntaxBlock(syntaxBlock));
    expect(parsed.template).toContain('xlo');
    expect(parsed.parameters.some((p) => p.names.includes('xlo'))).toBe(true);
    expect(resolvePositionalParameter(parsed, 0)?.names).toContain('xlo');
  });

  it('parses region style variants', () => {
    const text = readFileSync(path.join(docDir, 'region.txt'), 'utf8');
    const syntaxBlock = text.slice(
      text.indexOf('[Syntax:]') + '[Syntax:]'.length,
      text.indexOf('[Examples:]')
    );
    const parsed = parseSyntaxBlock(syntaxBlock);
    expect(parsed.styleVariants.some((v) => v.styles.includes('block'))).toBe(true);
    const block = parsed.styleVariants.find((v) => v.styles.includes('block'));
    expect(resolvePositionalParameter(parsed, 0, 'block')?.names).toContain('xlo');
    expect(block?.parameters[0]?.names).toContain('xlo');
  });

  it('parses boundary keywords', () => {
    const text = readFileSync(path.join(docDir, 'boundary.txt'), 'utf8');
    const syntaxBlock = text.slice(
      text.indexOf('[Syntax:]') + '[Syntax:]'.length,
      text.indexOf('[Examples:]')
    );
    const parsed = parseSyntaxBlock(syntaxBlock);
    expect(parsed.parameters.some((p) => p.names.includes('x'))).toBe(true);
  });
});

describe('provideArgHover', () => {
  it('hovers create_box xlo argument', () => {
    const line = 'create_box 0 10 0 10 -0.5 0.5';
    const state = getLineArgStateAt(line, 11);
    expect(state?.command).toBe('create_box');
    expect(state?.argIndex).toBe(0);
    const hover = provideArgHover(state!, '0');
    expect(hover?.value).toMatch(/xlo/i);
    expect(hover?.value).toMatch(/box bounds/i);
  });

  it('hovers fix ID argument', () => {
    const line = 'fix myid adapt 1000 all refine particle 10 50';
    const state = getLineArgStateAt(line, 6);
    expect(state?.argIndex).toBe(0);
    const hover = provideArgHover(state!, 'myid');
    expect(hover?.value).toMatch(/assigned name for the fix/i);
  });

  it('hovers fix adapt Nfreq argument', () => {
    const line = 'fix 1 adapt 1000 all refine particle 10 50';
    const state = getLineArgStateAt(line, 14);
    expect(state?.argIndex).toBe(2);
    const hover = provideArgHover(state!, '1000');
    expect(hover?.value).toMatch(/Nfreq/i);
    expect(hover?.value).toMatch(/grid adaptation/i);
  });

  it('hovers region block xlo argument', () => {
    const line = 'region box1 block 0 1 0 1 0 1';
    const state = getLineArgStateAt(line, 18);
    expect(state?.argIndex).toBe(2);
    const hover = provideArgHover(state!, '0');
    expect(hover?.value).toMatch(/xlo/i);
    expect(hover?.value).toMatch(/bounds of block/i);
  });

  it('hovers boundary x face argument', () => {
    const line = 'boundary o p p';
    const state = getLineArgStateAt(line, 9);
    expect(state?.argIndex).toBe(0);
    const hover = provideArgHover(state!, 'o');
    expect(hover?.value).toMatch(/\bx\b/i);
  });
});
