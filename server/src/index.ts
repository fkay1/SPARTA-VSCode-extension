import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  TextDocumentPositionParams,
  Hover,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { lexDocument } from './lexer';
import { parseDocument } from './parser';
import {
  getPrefixStart,
  getWordAtPosition,
  provideCompletions,
  provideHover,
} from './providers/completion';

const connection = createConnection(ProposedFeatures.all);

const documents = new TextDocuments(TextDocument);

let validateOrdering = true;
let docBaseUrl = 'https://sparta.github.io';

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [' '],
      },
      hoverProvider: true,
    },
  };
});

connection.onInitialized(() => {
  connection.client.register(DidChangeConfigurationNotification.type, undefined);
});

connection.onDidChangeConfiguration((change) => {
  const settings = change.settings as {
    sparta?: { validateOrdering?: boolean; docBaseUrl?: string };
  };
  validateOrdering = settings?.sparta?.validateOrdering ?? true;
  docBaseUrl = settings?.sparta?.docBaseUrl ?? 'https://sparta.github.io';
});

function validateTextDocument(textDocument: TextDocument): void {
  const text = textDocument.getText();
  const { logicalLines, diagnostics: lexDiags } = lexDocument(text);
  const { diagnostics: parseDiags } = parseDocument(logicalLines, validateOrdering);

  const allDiags = [...lexDiags, ...parseDiags];
  const diagnostics: Diagnostic[] = allDiags.map((d) => ({
    severity:
      d.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
    range: {
      start: { line: d.line, character: 0 },
      end: {
        line: d.line,
        character: Math.max(
          0,
          textDocument.lineCount > d.line
            ? textDocument.getText({
                start: { line: d.line, character: 0 },
                end: { line: d.line, character: 999 },
              }).length
            : 0
        ),
      },
    },
    message: d.message,
    source: 'sparta',
    code: d.code,
  }));

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

connection.onCompletion((params: CompletionParams): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const line = document.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line, character: params.position.character },
  });

  const prefix = getWordAtPosition(line, params.position.character) ?? '';
  const prefixStart = getPrefixStart(line, params.position.character);

  const items = provideCompletions({
    linePrefix: line,
    prefix,
    prefixStart,
    character: params.position.character,
  });

  // LSP ranges must use absolute document positions
  return items.map((item) => {
    if (item.textEdit && 'range' in item.textEdit) {
      return {
        ...item,
        textEdit: {
          range: {
            start: {
              line: params.position.line,
              character: item.textEdit.range.start.character,
            },
            end: {
              line: params.position.line,
              character: item.textEdit.range.end.character,
            },
          },
          newText: item.textEdit.newText,
        },
      };
    }
    return item;
  });
});

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const line = document.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line, character: 999 },
  });

  const word = getWordAtPosition(line, params.position.character);
  if (!word) {
    return null;
  }

  const hover = provideHover(word, docBaseUrl);
  if (!hover) {
    return null;
  }

  return {
    contents: hover.contents,
  };
});

documents.listen(connection);
connection.listen();

console.log('SPARTA language server started');
