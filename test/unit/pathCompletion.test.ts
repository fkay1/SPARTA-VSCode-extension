import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver';
import { getArgContext, getFileRule } from '../../server/src/file-args';
import { providePathCompletions } from '../../server/src/providers/pathCompletion';

describe('file-args', () => {
  it('detects species file argument at index 0', () => {
    const ctx = getArgContext('species air.');
    expect(ctx).not.toBeNull();
    expect(getFileRule(ctx!)?.extensions).toContain('.species');
  });

  it('detects collide vss file at index 2', () => {
    const ctx = getArgContext('collide vss air air.');
    expect(getFileRule(ctx!)?.extensions).toContain('.vss');
  });

  it('detects include file at index 0 after space', () => {
    const ctx = getArgContext('include ');
    expect(ctx?.argIndex).toBe(0);
    expect(getFileRule(ctx!)).not.toBeNull();
  });
});

describe('pathCompletion', () => {
  it('lists .species files in search directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sparta-test-'));
    fs.writeFileSync(path.join(tmp, 'air.species'), 'N2 28\n');
    fs.writeFileSync(path.join(tmp, 'other.txt'), 'x');

    const ctx = getArgContext('species ');
    const items = providePathCompletions(ctx!, [tmp], tmp);
    expect(items.some((i) => i.label === 'air.species')).toBe(true);
    expect(items.every((i) => i.kind === CompletionItemKind.File)).toBe(true);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
