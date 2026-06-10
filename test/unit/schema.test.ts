import { describe, expect, it } from 'vitest';
import { readSectionCommands } from '../../scripts/extract-schema';
import commandArgs from '../../server/src/schema/command-args.json';
import styleArgs from '../../server/src/schema/style-args.json';
import * as path from 'path';

const DOC_DIR = path.resolve(__dirname, '../../../sparta/doc');

describe('schema extractor', () => {
  it('extracts expected command and style counts', () => {
    const { commands, styleSections } = readSectionCommands(DOC_DIR);

    expect(commands.length).toBeGreaterThanOrEqual(60);
    expect(commands).toContain('species');
    expect(commands).toContain('read_surf');
    expect(commands).toContain('run');

    expect(styleSections.fix?.length).toBeGreaterThanOrEqual(20);
    expect(styleSections.compute?.length).toBeGreaterThanOrEqual(25);
    expect(styleSections.collide).toEqual(['vss']);
    expect(styleSections.surf_collide?.length).toBeGreaterThanOrEqual(8);
  });

  it('command-args.json covers all commands with syntax', () => {
    expect(commandArgs.length).toBeGreaterThanOrEqual(60);
    const withParams = commandArgs.filter((c) => c.syntax.parameters.length > 0);
    expect(withParams.length).toBeGreaterThan(50);
    expect(styleArgs.length).toBeGreaterThan(50);
  });
});
