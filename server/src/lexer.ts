export interface SourceRange {
  start: number;
  end: number;
}

export interface Token {
  text: string;
  range: SourceRange;
  quoted: boolean;
}

export interface LogicalLine {
  text: string;
  startLine: number;
  endLine: number;
}

export interface LexResult {
  logicalLines: LogicalLine[];
  diagnostics: LexDiagnostic[];
}

export interface LexDiagnostic {
  message: string;
  line: number;
  code: string;
  severity: 'error' | 'warning';
}

/**
 * Merge physical lines using SPARTA's & continuation and triple-quote rules.
 */
export function mergeLogicalLines(source: string): { lines: LogicalLine[]; diagnostics: LexDiagnostic[] } {
  const physical = source.split(/\r?\n/);
  const lines: LogicalLine[] = [];
  const diagnostics: LexDiagnostic[] = [];
  let i = 0;

  while (i < physical.length) {
    let text = physical[i];
    const startLine = i;
    let endLine = i;

    while (true) {
      const trimmed = stripComment(text);
      const tripleCount = countTripleQuotes(trimmed);
      const needsMoreTriple = tripleCount % 2 === 1;
      const continues = !needsMoreTriple && hasLineContinuation(text);

      if (!continues && !needsMoreTriple) {
        break;
      }

      if (i + 1 >= physical.length) {
        if (needsMoreTriple) {
          diagnostics.push({
            message: 'Unclosed triple-quoted string',
            line: startLine,
            code: 'sparta/parse/unclosed-triple-quote',
            severity: 'error',
          });
        }
        break;
      }

      i++;
      endLine = i;
      if (continues) {
        text = removeContinuation(text) + ' ' + physical[i];
      } else {
        text = text + '\n' + physical[i];
      }
    }

    lines.push({ text, startLine, endLine });
    i++;
  }

  return { lines, diagnostics };
}

export function stripComment(line: string): string {
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inTriple = false;

  while (i < line.length) {
    if (!inSingle && !inDouble && line.startsWith('"""', i)) {
      inTriple = !inTriple;
      i += 3;
      continue;
    }
    if (!inDouble && !inTriple && line[i] === "'") {
      inSingle = !inSingle;
      i++;
      continue;
    }
    if (!inSingle && !inTriple && line[i] === '"') {
      inDouble = !inDouble;
      i++;
      continue;
    }
    if (!inSingle && !inDouble && !inTriple && line[i] === '#') {
      return line.slice(0, i);
    }
    i++;
  }

  return line;
}

export function hasLineContinuation(line: string): boolean {
  const trimmed = line.trimEnd();
  if (!trimmed.endsWith('&')) {
    return false;
  }
  if (isAmpersandInsideQuotes(trimmed)) {
    return false;
  }
  // SPARTA: a # comment after trailing & prevents continuation
  const ampIdx = trimmed.lastIndexOf('&');
  const beforeComment = stripComment(trimmed);
  if (beforeComment.lastIndexOf('&') !== ampIdx) {
    return false;
  }
  const afterAmp = trimmed.slice(ampIdx + 1).trimStart();
  if (afterAmp.startsWith('#')) {
    return false;
  }
  return true;
}

function removeContinuation(line: string): string {
  const noComment = stripComment(line);
  const idx = noComment.lastIndexOf('&');
  if (idx < 0) {
    return noComment.trimEnd();
  }
  return noComment.slice(0, idx).trimEnd();
}

function isAmpersandInsideQuotes(line: string): boolean {
  const idx = line.lastIndexOf('&');
  if (idx < 0) {
    return false;
  }
  let inSingle = false;
  let inDouble = false;
  let inTriple = false;
  for (let i = 0; i < idx; i++) {
    if (!inSingle && !inDouble && line.startsWith('"""', i)) {
      inTriple = !inTriple;
      i += 2;
      continue;
    }
    if (!inDouble && !inTriple && line[i] === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && !inTriple && line[i] === '"') {
      inDouble = !inDouble;
    }
  }
  return inSingle || inDouble || inTriple;
}

function countTripleQuotes(line: string): number {
  let count = 0;
  let i = 0;
  let inSingle = false;
  let inDouble = false;

  while (i < line.length) {
    if (!inSingle && !inDouble && line.startsWith('"""', i)) {
      count++;
      i += 3;
      continue;
    }
    if (!inDouble && line[i] === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && line[i] === '"') {
      inDouble = !inDouble;
    }
    i++;
  }
  return count;
}

/**
 * Tokenize a logical line into words, respecting quoted strings.
 */
export function tokenizeLine(line: string): { tokens: Token[]; diagnostics: LexDiagnostic[] } {
  const diagnostics: LexDiagnostic[] = [];
  const content = stripComment(line).trim();
  if (!content) {
    return { tokens: [], diagnostics };
  }

  const tokens: Token[] = [];
  let i = 0;

  while (i < content.length) {
    while (i < content.length && /\s/.test(content[i])) {
      i++;
    }
    if (i >= content.length) {
      break;
    }

    const start = i;
    let text = '';
    let quoted = false;

    if (content.startsWith('"""', i)) {
      quoted = true;
      i += 3;
      const close = content.indexOf('"""', i);
      if (close < 0) {
        diagnostics.push({
          message: 'Unclosed triple-quoted string',
          line: 0,
          code: 'sparta/parse/unclosed-triple-quote',
          severity: 'error',
        });
        text = content.slice(i);
        i = content.length;
      } else {
        text = content.slice(i, close);
        i = close + 3;
      }
    } else if (content[i] === '"' || content[i] === "'") {
      quoted = true;
      const quote = content[i];
      i++;
      while (i < content.length && content[i] !== quote) {
        text += content[i];
        i++;
      }
      if (i >= content.length) {
        diagnostics.push({
          message: `Unbalanced ${quote} quotes in command`,
          line: 0,
          code: 'sparta/parse/unbalanced-quotes',
          severity: 'error',
        });
      } else {
        i++;
        if (i < content.length && !/\s/.test(content[i])) {
          diagnostics.push({
            message: 'Quote must be followed by whitespace or end of line',
            line: 0,
            code: 'sparta/parse/quote-not-followed-by-space',
            severity: 'error',
          });
        }
      }
    } else {
      while (i < content.length && !/\s/.test(content[i])) {
        text += content[i];
        i++;
      }
    }

    if (text.length > 0) {
      tokens.push({ text, range: { start, end: i }, quoted });
    }
  }

  return { tokens, diagnostics };
}

/** Find ${name}, $x, $(expr) spans for highlighting/diagnostics. */
export function findVariableRefs(text: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  const patterns = [/\$\{[^}]+\}/g, /\$\([^)]+\)/g, /\$[a-zA-Z_]/g];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return ranges;
}

export function lexDocument(source: string): LexResult {
  const { lines, diagnostics } = mergeLogicalLines(source);
  const allDiagnostics = [...diagnostics];

  for (const line of lines) {
    const { diagnostics: tokenDiags } = tokenizeLine(line.text);
    for (const d of tokenDiags) {
      allDiagnostics.push({ ...d, line: line.startLine });
    }
  }

  return { logicalLines: lines, diagnostics: allDiagnostics };
}
