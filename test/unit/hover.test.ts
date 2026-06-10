import { describe, expect, it } from 'vitest';
import { MarkupKind } from 'vscode-languageserver';
import { plainDocText } from '../../server/src/doc-markdown';
import {
  getWordAtPosition,
  getWordRangeAtPosition,
  provideHover,
} from '../../server/src/providers/completion';

function hoverMarkdown(result: NonNullable<ReturnType<typeof provideHover>>): string {
  const block = result.contents;
  return Array.isArray(block) ? block.map((b) => b.value).join('\n') : block.value;
}

describe('getWordAtPosition', () => {
  const line = 'create_box 0 10 0 10 -0.5 0.5';

  it('finds full command when cursor is at word start', () => {
    expect(getWordAtPosition(line, 0)).toBe('create_box');
    expect(getWordRangeAtPosition(line, 0)).toEqual({ word: 'create_box', start: 0, end: 10 });
  });

  it('finds full command when cursor is in the middle', () => {
    expect(getWordAtPosition(line, 5)).toBe('create_box');
    expect(getWordAtPosition(line, 9)).toBe('create_box');
  });

  it('finds full command when cursor is at word end', () => {
    expect(getWordAtPosition(line, 10)).toBe('create_box');
  });

  it('returns undefined over whitespace between args', () => {
    expect(getWordAtPosition('create_box 0 10', 12)).toBeUndefined();
  });
});

describe('plainDocText', () => {
  it('strips SPARTA link markup and carriage returns', () => {
    const raw =
      'Set a fix.\r In SPARTA, a "fix" is\r an operation.\r See "Section 10"_Section_modify.html for details.';
    expect(plainDocText(raw)).toBe(
      'Set a fix. In SPARTA, a "fix" is an operation. See Section 10 for details.'
    );
  });

  it('truncates long descriptions at a sentence boundary', () => {
    const raw = 'First sentence here. Second sentence here. Third sentence here.';
    const out = plainDocText(raw, 40);
    expect(out).toBe('First sentence here.');
    expect(out.length).toBeLessThanOrEqual(40);
  });
});

describe('provideHover', () => {
  const baseUrl = 'https://sparta.github.io';

  it('shows command description for fix', () => {
    const hover = provideHover('fix', baseUrl);
    expect(hover).not.toBeNull();
    expect(hover!.contents.kind).toBe(MarkupKind.Markdown);
    expect(hover!.contents.value).toContain('**fix**');
    expect(hover!.contents.value).toMatch(/Set a fix/);
    expect(hover!.contents.value).not.toMatch(/_Section_modify/);
    expect(hoverMarkdown(hover!)).toContain('[SPARTA manual]');
  });

  it('shows style description for adapt', () => {
    const hover = provideHover('adapt', baseUrl);
    expect(hover).not.toBeNull();
    expect(hover!.contents.value).toContain('fix style: adapt');
    expect(hover!.contents.value).toMatch(/grid adaptation/i);
  });

  it('shows command description for create_box', () => {
    const hover = provideHover('create_box', baseUrl);
    expect(hover).not.toBeNull();
    expect(hoverMarkdown(hover!)).toMatch(/simulation box/i);
  });
});
