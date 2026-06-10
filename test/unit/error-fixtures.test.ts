import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { mergeLogicalLines } from '../../server/src/lexer';
import { parseDocument } from '../../server/src/parser';

interface ExpectedDiagnostic {
  code: string;
  line: number;
  severity: 'error' | 'warning';
  messageContains?: string;
}

const FIXTURES_DIR = path.join(__dirname, '../fixtures/errors');

describe('error fixtures', () => {
  const fixtures = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.in'));

  for (const fixture of fixtures) {
    const base = fixture.replace(/\.in$/, '');
    it(base, () => {
      const src = fs.readFileSync(path.join(FIXTURES_DIR, fixture), 'utf8');
      const expectPath = path.join(FIXTURES_DIR, `${base}.expect.json`);
      const expected: ExpectedDiagnostic[] = JSON.parse(fs.readFileSync(expectPath, 'utf8'));

      const { lines } = mergeLogicalLines(src);
      const { diagnostics } = parseDocument(lines, true);

      for (const exp of expected) {
        const match = diagnostics.find(
          (d) =>
            d.code === exp.code &&
            d.line === exp.line &&
            d.severity === exp.severity &&
            (!exp.messageContains ||
              d.message.toLowerCase().includes(exp.messageContains.toLowerCase()))
        );
        expect(match, `Expected diagnostic ${exp.code} at line ${exp.line}`).toBeDefined();
      }
    });
  }
});
