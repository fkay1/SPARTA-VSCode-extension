import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { lexDocument } from '../lexer';
import { parseDocument } from '../parser';

const SECTION_HINTS: [string, string][] = [
  ['dimension', 'Initialization'],
  ['seed', 'Initialization'],
  ['units', 'Initialization'],
  ['boundary', 'Initialization'],
  ['create_box', 'Geometry'],
  ['create_grid', 'Geometry'],
  ['read_grid', 'Geometry'],
  ['read_surf', 'Geometry'],
  ['species', 'Species'],
  ['mixture', 'Species'],
  ['collide', 'Physics'],
  ['react', 'Physics'],
  ['surf_collide', 'Surfaces'],
  ['surf_modify', 'Surfaces'],
  ['fix', 'Settings'],
  ['compute', 'Output'],
  ['dump', 'Output'],
  ['stats', 'Output'],
  ['timestep', 'Run'],
  ['run', 'Run'],
];

function sectionForCommand(command: string): string {
  for (const [cmd, section] of SECTION_HINTS) {
    if (command === cmd) {
      return section;
    }
  }
  return 'Commands';
}

export function provideDocumentSymbols(document: TextDocument): DocumentSymbol[] {
  const { logicalLines } = lexDocument(document.getText());
  const { commands } = parseDocument(logicalLines, false);

  const sections = new Map<string, DocumentSymbol>();

  for (const cmd of commands) {
    const sectionName = sectionForCommand(cmd.command);
    if (!sections.has(sectionName)) {
      sections.set(sectionName, {
        name: sectionName,
        kind: SymbolKind.Namespace,
        range: lineRange(document, cmd.line),
        selectionRange: lineRange(document, cmd.line),
        children: [],
      });
    }

    const label =
      cmd.args.length > 0
        ? `${cmd.command} ${cmd.args.slice(0, 3).join(' ')}${cmd.args.length > 3 ? ' …' : ''}`
        : cmd.command;

    sections.get(sectionName)!.children!.push({
      name: label,
      kind: SymbolKind.Function,
      range: lineRange(document, cmd.line, cmd.endLine),
      selectionRange: lineRange(document, cmd.line),
      detail: cmd.command,
    });
  }

  return [...sections.values()];
}

function lineRange(document: TextDocument, startLine: number, endLine = startLine) {
  const start = { line: startLine, character: 0 };
  const endChar = document.getText({ start: { line: endLine, character: 0 }, end: { line: endLine, character: 9999 } }).length;
  return {
    start,
    end: { line: endLine, character: endChar },
  };
}
