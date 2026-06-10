import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  Hover,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionParams,
  DocumentSymbolParams,
  SemanticTokensParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { getArgContext } from './file-args';
import { getLineArgStateAt, getWordRangeAtPosition } from './completion-stages';
import { lexDocument } from './lexer';
import { parseDocument } from './parser';
import { provideArgHover } from './providers/argHover';
import {
  getPrefixStart,
  getWordAtPosition,
  provideCompletions,
  provideHover,
} from './providers/completion';
import { provideDocumentSymbols } from './providers/documentSymbols';
import {
  documentDirFromUri,
  providePathCompletions,
} from './providers/pathCompletion';
import { provideSemanticTokens, SEMANTIC_LEGEND } from './providers/semanticTokens';

const connection = createConnection(ProposedFeatures.all);

const documents = new TextDocuments(TextDocument);

let validateOrdering = true;
let docBaseUrl = 'https://sparta.github.io';
let workspaceRoots: string[] = [];

connection.onInitialize((params: InitializeParams): InitializeResult => {
  workspaceRoots =
    params.workspaceFolders?.map((f) => f.uri).map(documentDirFromUri).filter(Boolean) as string[] ??
    (params.rootUri ? [documentDirFromUri(params.rootUri)].filter(Boolean) as string[] : []);

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [' ', '.', '/'],
      },
      hoverProvider: true,
      documentSymbolProvider: true,
      semanticTokensProvider: {
        legend: SEMANTIC_LEGEND,
        full: true,
        range: false,
      },
      workspace: {
        workspaceFolders: {
          supported: true,
          changeNotifications: true,
        },
      },
    },
  };
});

function applyWorkspaceFolderChange(event: {
  added: { uri: string }[];
  removed: { uri: string }[];
}): void {
  for (const folder of event.removed) {
    const dir = documentDirFromUri(folder.uri);
    if (dir) {
      workspaceRoots = workspaceRoots.filter((r) => r !== dir);
    }
  }
  for (const folder of event.added) {
    const dir = documentDirFromUri(folder.uri);
    if (dir && !workspaceRoots.includes(dir)) {
      workspaceRoots.push(dir);
    }
  }
}

connection.onInitialized(() => {
  connection.client.register(DidChangeConfigurationNotification.type, undefined);

  // Only subscribe when the client advertises workspace folder support.
  try {
    connection.workspace.onDidChangeWorkspaceFolders(applyWorkspaceFolderChange);
  } catch {
    // Workspace roots from onInitialize are sufficient for path completion.
  }
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

  const { logicalLines } = lexDocument(document.getText());
  const { idRegistry } = parseDocument(logicalLines, false);

  const items = provideCompletions({
    linePrefix: line,
    prefix,
    prefixStart,
    character: params.position.character,
    idRegistry,
  });

  const argCtx = getArgContext(line);
  if (argCtx) {
    const docDir = documentDirFromUri(params.textDocument.uri);
    const pathItems = providePathCompletions(argCtx, workspaceRoots, docDir);
    items.push(...pathItems);
  }

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
    if (item.kind === CompletionItemKind.File && !item.textEdit) {
      // CompletionItemKind.File — apply text edit for partial path
      return {
        ...item,
        textEdit: {
          range: {
            start: { line: params.position.line, character: prefixStart },
            end: { line: params.position.line, character: params.position.character },
          },
          newText: item.insertText ?? item.label,
        },
      };
    }
    return item;
  });
});

connection.onDocumentSymbol((params: DocumentSymbolParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  return provideDocumentSymbols(document);
});

connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return { data: [] };
  }
  return provideSemanticTokens(document);
});

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const line = document.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line, character: Number.MAX_SAFE_INTEGER },
  });

  const wordRange = getWordRangeAtPosition(line, params.position.character);
  if (!wordRange) {
    return null;
  }

  const argState = getLineArgStateAt(line, params.position.character);
  if (argState && argState.argIndex >= 0) {
    const argHover = provideArgHover(argState, wordRange.word);
    if (argHover) {
      return {
        contents: argHover,
        range: {
          start: { line: params.position.line, character: wordRange.start },
          end: { line: params.position.line, character: wordRange.end },
        },
      };
    }
  }

  const hover = provideHover(wordRange.word, docBaseUrl);
  if (!hover) {
    return null;
  }

  return {
    contents: hover.contents,
    range: {
      start: { line: params.position.line, character: wordRange.start },
      end: { line: params.position.line, character: wordRange.end },
    },
  };
});

documents.listen(connection);
connection.listen();

console.log('SPARTA language server started');
