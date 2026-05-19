import { SemanticTokens, SemanticTokensLegend } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { lexDocument, stripComment, tokenizeLine } from '../lexer';
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
    const commentIdx = raw.indexOf('#');
    if (commentIdx >= 0 && !isHashInQuotes(raw, commentIdx)) {
      pushToken(data, lineIdx, prevLine, prevChar, commentIdx, raw.length - commentIdx, 5, 0);
      prevLine = lineIdx;
      prevChar = commentIdx;
    }

    const code = commentIdx >= 0 ? raw.slice(0, commentIdx) : raw;
    const { tokens } = tokenizeLine(code);
    if (tokens.length === 0) {
      continue;
    }

    let charOffset = code.indexOf(tokens[0].text);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const pos = i === 0 ? charOffset : code.indexOf(tok.text, charOffset);
      if (pos < 0) {
        continue;
      }
      charOffset = pos + tok.text.length;

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

      pushToken(data, lineIdx, prevLine, prevChar, pos, tok.text.length, type, 0);
      prevLine = lineIdx;
      prevChar = pos;
    }

    // Highlight ${var} inside unquoted segments
    for (const m of code.matchAll(/\$\{[^}]+\}|\$\([^)]+\)|\$[a-zA-Z_]/g)) {
      pushToken(data, lineIdx, prevLine, prevChar, m.index!, m[0].length, 2, 0);
      prevLine = lineIdx;
      prevChar = m.index!;
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

function isHashInQuotes(line: string, hashIdx: number): boolean {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < hashIdx; i++) {
    if (line.startsWith('"""', i)) {
      i += 2;
      continue;
    }
    if (!inDouble && line[i] === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && line[i] === '"') {
      inDouble = !inDouble;
    }
  }
  return inSingle || inDouble;
}
