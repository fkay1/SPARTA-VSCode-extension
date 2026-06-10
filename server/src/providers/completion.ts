import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupContent,
  MarkupKind,
  Range,
} from 'vscode-languageserver';
import commandsFull from '../schema/commands-full.json';
import stylesFull from '../schema/styles-full.json';
import type { IdRegistry } from '../id-registry';
import {
  getLineArgState,
  idRegistryKey,
  isIdStyleCommand,
  resolveStage,
  styleFamilyForCommand,
  STYLE_FIRST_COMMANDS,
  getWordRangeAtPosition,
} from '../completion-stages';
import { plainDocText, escapeMarkdown } from '../doc-markdown';
import { createEmptyIdRegistry, getCommands, getStyles } from '../parser';
import { getStyleArgSnippet } from '../style-snippets';

export interface CompletionContext {
  linePrefix: string;
  prefix: string;
  prefixStart: number;
  character: number;
  idRegistry?: IdRegistry;
}

const ARG_SNIPPETS: Record<
  string,
  { label: string; insertText: string; detail: string; fullLine?: boolean }
> = {
  create_box: {
    label: 'create_box — xmin xmax ymin ymax zmin zmax',
    insertText: '${1:0} ${2:10} ${3:0} ${4:10} ${5:-0.5} ${6:0.5}',
    detail: 'Define simulation box',
    fullLine: true,
  },
  create_grid: {
    label: 'create_grid — Nx Ny Nz',
    insertText: '${1:20} ${2:20} ${3:1}',
    detail: 'Overlay grid on simulation box',
    fullLine: true,
  },
  read_surf: {
    label: 'read_surf — filename',
    insertText: '${1:surf.file}',
    detail: 'Read surface elements from file',
    fullLine: true,
  },
  species: {
    label: 'species — file ID1 ID2 …',
    insertText: '${1:air.species} ${2:N} ${3:O}',
    detail: 'Define species from file',
    fullLine: true,
  },
  variable: {
    label: 'variable — name equal formula',
    insertText: '${1:name} equal ${2:1.0}',
    detail: 'Define equal-style variable',
    fullLine: true,
  },
  run: {
    label: 'run — N',
    insertText: '${1:1000}',
    detail: 'Run simulation for N timesteps',
    fullLine: true,
  },
  mixture: {
    label: 'mixture — ID species …',
    insertText: '${1:air} ${2:N} ${3:O} vstream ${4:100.0} 0 0',
    detail: 'Define species mixture',
    fullLine: true,
  },
  timestep: {
    label: 'timestep — dt',
    insertText: '${1:1.0e-9}',
    detail: 'Set integration timestep',
    fullLine: true,
  },
};

const DEFAULT_ID_SUGGESTIONS = ['1', '2', 'in', 'out', 'myFix', 'myCompute'];

export function provideCompletions(ctx: CompletionContext): CompletionItem[] {
  const registry = ctx.idRegistry ?? createEmptyIdRegistry();
  const trimmed = ctx.linePrefix.trimStart();
  const endsWithSpace = /\s$/.test(ctx.linePrefix);
  const words = trimmed.split(/\s+/).filter(Boolean);
  const replaceRange: Range = {
    start: { line: 0, character: ctx.prefixStart },
    end: { line: 0, character: ctx.character },
  };

  const argState = getLineArgState(ctx.linePrefix);
  if (argState) {
    const stage = resolveStage(argState);
    if (stage === 'user-id') {
      return buildIdItems(argState, registry, replaceRange, endsWithSpace);
    }
    if (stage === 'style') {
      return buildStyleItemsForState(argState, replaceRange);
    }
    if (stage === 'style-args') {
      return buildStyleArgItems(argState, replaceRange, endsWithSpace);
    }
  }

  // After "command " — simple commands with full-line snippets
  if (words.length >= 1 && endsWithSpace && words.length === 1) {
    const command = words[0];
    const snippet = ARG_SNIPPETS[command];
    if (snippet) {
      return [
        buildInsertSnippet(snippet.label, snippet.insertText, snippet.detail, {
          start: { line: 0, character: ctx.character },
          end: { line: 0, character: ctx.character },
        }),
      ];
    }
  }

  // First word on line — top-level commands
  if (words.length <= 1) {
    const items: CompletionItem[] = [];
    const matching = getCommands().filter(
      (cmd) => !ctx.prefix || cmd.startsWith(ctx.prefix)
    );

    for (const cmd of matching) {
      items.push({
        label: cmd,
        kind: CompletionItemKind.Keyword,
        detail: 'SPARTA command',
        sortText: `1_${cmd}`,
        textEdit: { range: replaceRange, newText: cmd },
      });

      if (ctx.prefix === cmd && isIdStyleCommand(cmd)) {
        items.push({
          label: `${cmd} — ID style …`,
          kind: CompletionItemKind.Snippet,
          detail: `Insert ${cmd} with ID and style placeholders`,
          sortText: `0_${cmd}`,
          insertText: `${cmd} \${1:ID} \${2:style} $0`,
          insertTextFormat: InsertTextFormat.Snippet,
          textEdit: {
            range: replaceRange,
            newText: `${cmd} \${1:ID} \${2:style} $0`,
          },
        });
      } else if (ctx.prefix === cmd && ARG_SNIPPETS[cmd]) {
        const sn = ARG_SNIPPETS[cmd];
        items.push(
          buildInsertSnippet(
            sn.label,
            `${cmd} ${sn.insertText}`,
            sn.detail,
            replaceRange
          )
        );
      }
    }
    return items;
  }

  return [];
}

function buildIdItems(
  state: ReturnType<typeof getLineArgState>,
  registry: IdRegistry,
  replaceRange: Range,
  endsWithSpace: boolean
): CompletionItem[] {
  if (!state) {
    return [];
  }
  const key = isIdStyleCommand(state.command) ? idRegistryKey(state.command) : null;
  const existing = key ? registry[key as keyof IdRegistry] : [];
  const partial = state.partial.toLowerCase();
  const items: CompletionItem[] = [];

  for (const id of existing) {
    if (partial && !id.toLowerCase().startsWith(partial)) {
      continue;
    }
    items.push({
      label: id,
      kind: CompletionItemKind.Variable,
      detail: `Existing ${state.command} ID`,
      sortText: `0_${id}`,
      textEdit: { range: replaceRange, newText: id },
    });
  }

  for (const suggestion of DEFAULT_ID_SUGGESTIONS) {
    if (existing.includes(suggestion)) {
      continue;
    }
    if (partial && !suggestion.toLowerCase().startsWith(partial)) {
      continue;
    }
    items.push({
      label: suggestion,
      kind: CompletionItemKind.Variable,
      detail: `New ${state.command} ID`,
      sortText: `1_${suggestion}`,
      textEdit: { range: replaceRange, newText: suggestion },
    });
  }

  if (endsWithSpace && items.length === 0) {
    items.push({
      label: 'ID',
      kind: CompletionItemKind.Snippet,
      detail: `${state.command} ID`,
      insertText: '${1:ID} ',
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: {
        range: replaceRange,
        newText: '${1:ID} ',
      },
    });
  }

  return items;
}

function buildStyleItemsForState(
  state: NonNullable<ReturnType<typeof getLineArgState>>,
  replaceRange: Range
): CompletionItem[] {
  let family: string;
  if (isIdStyleCommand(state.command)) {
    family = styleFamilyForCommand(state.command);
  } else if ((STYLE_FIRST_COMMANDS as readonly string[]).includes(state.command)) {
    family = state.command;
  } else {
    return [];
  }

  const partial = state.partial.toLowerCase();
  return getStyles(family)
    .filter((style) => !partial || style.toLowerCase().startsWith(partial))
    .map((style) => ({
      label: style,
      kind: CompletionItemKind.Method,
      detail: `${family} style`,
      sortText: `0_${style}`,
      textEdit: { range: replaceRange, newText: style },
    }));
}

function buildStyleArgItems(
  state: NonNullable<ReturnType<typeof getLineArgState>>,
  replaceRange: Range,
  endsWithSpace: boolean
): CompletionItem[] {
  let family: string;
  let style: string | undefined;

  if (isIdStyleCommand(state.command)) {
    family = styleFamilyForCommand(state.command);
    style = state.argsBefore[1];
  } else if ((STYLE_FIRST_COMMANDS as readonly string[]).includes(state.command)) {
    family = state.command;
    style = state.argsBefore[0];
  } else {
    return [];
  }

  if (!style) {
    return [];
  }

  const snippet = getStyleArgSnippet(family, style);
  if (!snippet && !endsWithSpace) {
    return [];
  }

  const insertText = snippet ?? '$0';
  const range = endsWithSpace
    ? { start: { line: 0, character: replaceRange.end.character }, end: replaceRange.end }
    : replaceRange;

  return [
    {
      label: `${state.command} ${style} — arguments`,
      kind: CompletionItemKind.Snippet,
      detail: `Arguments for ${family} style ${style}`,
      sortText: '0_args',
      insertText,
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: { range, newText: insertText },
    },
  ];
}

function buildInsertSnippet(
  label: string,
  insertText: string,
  detail: string,
  range: Range
): CompletionItem {
  return {
    label,
    kind: CompletionItemKind.Snippet,
    detail,
    sortText: '0_snippet',
    insertText,
    insertTextFormat: InsertTextFormat.Snippet,
    textEdit: { range, newText: insertText },
  };
}

const COMMAND_DOCS: Record<string, string> = Object.fromEntries(
  (commandsFull as Array<{ command: string; description?: string }>)
    .filter((c) => c.description)
    .map((c) => [c.command, c.description as string])
);

type StyleDocEntry = { family: string; style: string; description?: string };

const STYLE_DOCS = new Map<string, StyleDocEntry>();
for (const [family, entries] of Object.entries(
  stylesFull as Record<string, StyleDocEntry[]>
)) {
  for (const entry of entries) {
    if (!STYLE_DOCS.has(entry.style)) {
      STYLE_DOCS.set(entry.style, { ...entry, family });
    }
  }
}

function buildHoverContents(
  title: string,
  rawDescription: string | undefined,
  url: string
): MarkupContent {
  const parts = [title];
  if (rawDescription) {
    const text = plainDocText(rawDescription);
    if (text) {
      parts.push(escapeMarkdown(text));
    }
  }
  parts.push(`[SPARTA manual](${url})`);
  return {
    kind: MarkupKind.Markdown,
    value: parts.join('\n\n'),
  };
}

export function provideHover(
  word: string,
  docBaseUrl: string
): { contents: MarkupContent } | null {
  const commandDoc = COMMAND_DOCS[word];
  if (commandDoc) {
    return {
      contents: buildHoverContents(
        `**${word}**`,
        commandDoc,
        `${docBaseUrl}/${word}.html`
      ),
    };
  }

  for (const [family, styleList] of Object.entries(getStylesMap())) {
    if (styleList.includes(word)) {
      const slug =
        family === 'fix' || family === 'compute'
          ? `${family}_${word.replace(/\//g, '_')}`
          : word;
      const styleDoc = STYLE_DOCS.get(word);
      return {
        contents: buildHoverContents(
          `**${family} style: ${word}**`,
          styleDoc?.description,
          `${docBaseUrl}/${slug}.html`
        ),
      };
    }
  }

  return null;
}

function getStylesMap(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const family of [
    'fix',
    'compute',
    'collide',
    'react',
    'region',
    'surf_collide',
    'surf_react',
  ]) {
    result[family] = getStyles(family);
  }
  return result;
}

export function getWordAtPosition(line: string, character: number): string | undefined {
  return getWordRangeAtPosition(line, character)?.word;
}

export function getPrefixStart(line: string, character: number): number {
  return getWordRangeAtPosition(line, character)?.start ?? character;
}

export { getWordRangeAtPosition } from '../completion-stages';
