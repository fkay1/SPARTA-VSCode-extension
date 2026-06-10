import * as path from 'path';
import { commands, window, workspace, ExtensionContext } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  RequestType0,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { DocCache, openDocumentationPage } from './doc-cache';

let client: LanguageClient | undefined;
let docCache: DocCache | undefined;

const GetDocumentationPagesRequest = new RequestType0<string[], void>(
  'sparta/documentationPages'
);

const SPARTA_DOCUMENT_SELECTORS = [
  { scheme: 'file', language: 'sparta' },
  { scheme: 'file', pattern: '**/in.*' },
  { scheme: 'file', pattern: '**/*.in' },
] as const;

async function getDocumentationPages(): Promise<string[]> {
  return (await client?.sendRequest(GetDocumentationPagesRequest)) ?? [];
}

export function activate(context: ExtensionContext): void {
  docCache = new DocCache(context);
  void docCache.warmupMemoryCache();

  context.subscriptions.push(
    commands.registerCommand('sparta.openDoc', (url: string) => {
      if (docCache && typeof url === 'string' && url.length > 0) {
        void openDocumentationPage(url, docCache);
      }
    }),
    commands.registerCommand('sparta.refreshDocCache', async () => {
      if (!docCache) {
        return;
      }
      await docCache.refresh(getDocumentationPages);
      void window.showInformationMessage('SPARTA documentation cache refreshed.');
    })
  );

  const serverModule = context.asAbsolutePath(
    path.join('server', 'out', 'index.js')
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [...SPARTA_DOCUMENT_SELECTORS],
    synchronize: {
      configurationSection: 'sparta',
      fileEvents: workspace.createFileSystemWatcher('**/*.{species,vss,tce,surf,grid}'),
    },
  };

  client = new LanguageClient(
    'spartaLanguageServer',
    'SPARTA Language Server',
    serverOptions,
    clientOptions
  );

  void client.start().then(() => {
    docCache?.startBackgroundPrefetch(getDocumentationPages);
  });

  context.subscriptions.push({
    dispose: () => {
      void client?.stop();
    },
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
