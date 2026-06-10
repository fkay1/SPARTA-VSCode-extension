import { SemanticTokens, SemanticTokensLegend } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { tokenizeLine, unwrapQuotedCommandLine } from '../lexer';
import { getCommands } from '../parser';

export const SEMANTIC_LEGEND: SemanticTokensLegend = {
  tokenTypes: ['command', 'keyword', 'variable', 'string', 'number', 'comment'],
  tokenModifiers: [],
};

const COMMAND_SET = new Set(getCommands());
const KEYWORDS = new Set([
  'block', 'custom', 'twopass', 'vstream', 'subsonic', 'perspecies', 'nevery',
  'region', 'modulate', 'clip', 'invert', 'scale', 'rotate', 'trans', 'levels',
  'subset', 'index', 'equal', 'loop', 'world', 'universe', 'uloop', 'string',
  'format', 'delete', 'python', 'particle', 'grid', 'surf', 'then', 'elif',
  'else', 'here', 'vibfile', 'yes', 'no', 'all', 'none', 'vss', 'tce',
]);

export function provideSemanticTokens(document: TextDocument): SemanticTokens {
  const data: number[] = [];
  const lines = document.getText().split(/\r?\n/);
  let prevLine = 0;
  let prevChar = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const raw = lines[lineIdx];
    const codeLine = unwrapQuotedCommandLine(raw);
    const charOffset = quotedCommandCharOffset(raw, codeLine);
    const commentIdx = findCommentStart(codeLine);
    if (commentIdx >= 0) {
      const commentStart = charOffset + commentIdx;
      pushToken(data, lineIdx, prevLine, prevChar, commentStart, raw.length - commentStart, 5, 0);
      prevLine = lineIdx;
      prevChar = commentStart;
    }

    const code = commentIdx >= 0 ? codeLine.slice(0, commentIdx) : codeLine;
    const { tokens } = tokenizeLine(code);
    if (tokens.length === 0) {
      continue;
    }

    let searchFrom = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const pos = code.indexOf(tok.text, searchFrom);
      if (pos < 0) {
        continue;
      }
      searchFrom = pos + tok.text.length;

      let type = 0;
      if (i === 0 && COMMAND_SET.has(tok.text)) {
        type = 0; // command
      } else if (KEYWORDS.has(tok.text)) {
        type = 1;
      } else if (tok.quoted) {
        type = 3;
      } else if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(tok.text)) {
        type = 4;
      } else {
        continue;
      }

      pushToken(data, lineIdx, prevLine, prevChar, charOffset + pos, tok.text.length, type, 0);
      prevLine = lineIdx;
      prevChar = charOffset + pos;
    }

    // Highlight ${var} inside unquoted segments
    for (const m of code.matchAll(/\$\{[^}]+\}|\$\([^)]+\)|\$[a-zA-Z_]/g)) {
      pushToken(data, lineIdx, prevLine, prevChar, charOffset + m.index!, m[0].length, 2, 0);
      prevLine = lineIdx;
      prevChar = charOffset + m.index!;
    }
  }

  return { data };
}

function pushToken(
  data: number[],
  line: number,
  prevLine: number,
  prevChar: number,
  char: number,
  length: number,
  tokenType: number,
  tokenModifiers: number
): void {
  data.push(line - prevLine, char - (line === prevLine ? prevChar : 0), length, tokenType, tokenModifiers);
}

function findCommentStart(line: string): number {
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
      return i;
    }
    i++;
  }

  return -1;
}

function quotedCommandCharOffset(raw: string, unwrapped: string): number {
  if (raw === unwrapped) {
    return 0;
  }
  const trimmed = raw.trimStart();
  const leading = raw.length - trimmed.length;
  return leading + 1;
}
