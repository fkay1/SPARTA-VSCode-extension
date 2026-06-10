import { describe, expect, it } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver';
import { getLineArgState, resolveStage } from '../../server/src/completion-stages';
import { createEmptyIdRegistry, parseDocument } from '../../server/src/parser';
import { mergeLogicalLines } from '../../server/src/lexer';
import { provideCompletions } from '../../server/src/providers/completion';

function parse(src: string) {
  const { lines } = mergeLogicalLines(src);
  return parseDocument(lines, true);
}

describe('staged completion — fix / compute / region / surf_*', () => {
  const registry = {
    ...createEmptyIdRegistry(),
    fix: ['in', 'check'],
    compute: ['1'],
    region: ['box1'],
  };

  it('resolveStage: fix ID at arg 0', () => {
    expect(resolveStage(getLineArgState('fix ')!)).toBe('user-id');
    expect(resolveStage(getLineArgState('fix my')!)).toBe('user-id');
  });

  it('resolveStage: fix style at arg 1', () => {
    expect(resolveStage(getLineArgState('fix 1 ')!)).toBe('style');
    expect(resolveStage(getLineArgState('fix 1 ada')!)).toBe('style');
  });

  it('resolveStage: fix args at arg 2+', () => {
    expect(resolveStage(getLineArgState('fix 1 adapt ')!)).toBe('style-args');
  });

  it('offers existing fix IDs after "fix "', () => {
    const items = provideCompletions({
      linePrefix: 'fix ',
      prefix: '',
      prefixStart: 4,
      character: 4,
      idRegistry: registry,
    });
    expect(items.some((i) => i.label === 'in')).toBe(true);
    expect(items.some((i) => i.label === 'check')).toBe(true);
    expect(items.some((i) => i.kind === CompletionItemKind.Variable)).toBe(true);
  });

  it('offers styles after "fix ID "', () => {
    const items = provideCompletions({
      linePrefix: 'fix 1 ',
      prefix: '',
      prefixStart: 6,
      character: 6,
      idRegistry: registry,
    });
    const styles = items.filter((i) => i.kind === CompletionItemKind.Method);
    expect(styles.some((i) => i.label === 'adapt')).toBe(true);
    expect(styles.some((i) => i.label === 'emit/face')).toBe(true);
    expect(styles.some((i) => i.label === 'grid/check')).toBe(true);
  });

  it('filters styles when typing prefix after fix ID', () => {
    const items = provideCompletions({
      linePrefix: 'fix 1 em',
      prefix: 'em',
      prefixStart: 4,
      character: 8,
      idRegistry: registry,
    });
    expect(items.some((i) => i.label === 'emit/face')).toBe(true);
    expect(items.some((i) => i.label === 'adapt')).toBe(false);
  });

  it('does not treat fix ID as style prefix on word 2', () => {
    const items = provideCompletions({
      linePrefix: 'fix in ',
      prefix: '',
      prefixStart: 7,
      character: 7,
      idRegistry: registry,
    });
    expect(items.some((i) => i.label === 'adapt')).toBe(true);
  });

  it('offers style args after "fix ID style "', () => {
    const items = provideCompletions({
      linePrefix: 'fix 1 emit/face ',
      prefix: '',
      prefixStart: 16,
      character: 16,
      idRegistry: registry,
    });
    expect(items.some((i) => i.label.includes('emit/face'))).toBe(true);
    expect(items.some((i) => i.kind === CompletionItemKind.Snippet)).toBe(true);
  });

  it('works for compute ID style pattern', () => {
    const afterId = provideCompletions({
      linePrefix: 'compute 2 ',
      prefix: '',
      prefixStart: 10,
      character: 10,
      idRegistry: registry,
    });
    expect(afterId.some((i) => i.label === 'grid')).toBe(true);

    const afterStyle = provideCompletions({
      linePrefix: 'compute 2 grid ',
      prefix: '',
      prefixStart: 15,
      character: 15,
      idRegistry: registry,
    });
    expect(afterStyle.some((i) => i.kind === CompletionItemKind.Snippet)).toBe(true);
  });

  it('works for surf_collide ID style pattern', () => {
    const items = provideCompletions({
      linePrefix: 'surf_collide 1 ',
      prefix: '',
      prefixStart: 14,
      character: 14,
      idRegistry: registry,
    });
    expect(items.some((i) => i.label === 'diffuse')).toBe(true);
  });

  it('works for region ID style pattern', () => {
    const items = provideCompletions({
      linePrefix: 'region myreg ',
      prefix: '',
      prefixStart: 12,
      character: 12,
      idRegistry: registry,
    });
    expect(items.some((i) => i.label === 'block')).toBe(true);
  });
});

describe('idRegistry from parser', () => {
  it('collects fix and compute IDs from script', () => {
    const src = `fix in emit/face air all
compute 1 grid all n
region box1 block 0 10 0 10 -0.5 0.5`;
    const { idRegistry } = parse(src);
    expect(idRegistry.fix).toContain('in');
    expect(idRegistry.compute).toContain('1');
    expect(idRegistry.region).toContain('box1');
  });
});
