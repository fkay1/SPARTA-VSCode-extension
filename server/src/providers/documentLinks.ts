import { DocumentLink } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { unwrapQuotedCommandLine } from '../lexer';
import { getDocumentationLinkUrl } from '../style-doc-links';

const WORD_PATTERN = /\b[a-zA-Z_][\w./]*\b/g;

export function buildOpenDocCommandUri(url: string): string {
  return `command:sparta.openDoc?${encodeURIComponent(JSON.stringify([url]))}`;
}

export function provideDocumentLinks(
  document: TextDocument,
  docBaseUrl: string
): DocumentLink[] {
  const links: DocumentLink[] = [];
  const lines = document.getText().split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex];
    const codeLine = unwrapQuotedCommandLine(raw);
    const charOffset = codeLine === raw ? 0 : raw.trimStart().length + 1;
    const commentIdx = findCommentStart(codeLine);
    const code = commentIdx >= 0 ? codeLine.slice(0, commentIdx) : codeLine;

    let match: RegExpExecArray | null;
    WORD_PATTERN.lastIndex = 0;
    while ((match = WORD_PATTERN.exec(code)) !== null) {
      const word = match[0];
      const url = getDocumentationLinkUrl(word, docBaseUrl);
      if (!url) {
        continue;
      }

      const start = charOffset + match.index;
      links.push({
        range: {
          start: { line: lineIndex, character: start },
          end: { line: lineIndex, character: start + word.length },
        },
        target: buildOpenDocCommandUri(url),
        tooltip: `Open SPARTA manual: ${word}`,
      });
    }
  }

  return links;
}

function findCommentStart(line: string): number {
  let i = 0;
  let inSingle = false;
  let inDouble = false;

  while (i < line.length) {
    if (!inDouble && line[i] === "'") {
      inSingle = !inSingle;
      i++;
      continue;
    }
    if (!inSingle && line[i] === '"') {
      inDouble = !inDouble;
      i++;
      continue;
    }
    if (!inSingle && !inDouble && line[i] === '#') {
      return i;
    }
    i++;
  }

  return -1;
}
