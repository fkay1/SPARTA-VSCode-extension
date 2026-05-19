import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupContent,
  MarkupKind,
  Range,
} from 'vscode-languageserver';
import { getCommands, getStyles, isStyleCommand } from '../parser';

export interface CompletionContext {
  /** Text from line start to cursor */
  linePrefix: string;
  /** Word fragment being typed at cursor */
  prefix: string;
  /** Character offset where prefix starts on the line */
  prefixStart: number;
  /** Cursor character offset on the line */
  character: number;
}

/** Argument snippets keyed by command name. insertText is args-only unless fullLine is true. */
const ARG_SNIPPETS: Record<
  string,
  { label: string; insertText: string; detail: string; fullLine?: boolean }
> = {
  fix: {
    label: 'fix — ID style …',
    insertText: '${1:ID} ${2|ablate,adapt,ave/grid,ave/time,emit/face,grid/check,halt|} $0',
    detail: 'Insert fix ID and style',
  },
  compute: {
    label: 'compute — ID style …',
    insertText: '${1:ID} ${2|grid,temp,ke/particle,boundary,gas/collision/grid|} ${3:all} $0',
    detail: 'Insert compute ID and style',
  },
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
  collide: {
    label: 'collide — vss mix-ID file',
    insertText: 'vss ${1:air} ${2:air.vss}',
    detail: 'VSS collision model',
    fullLine: true,
  },
  timestep: {
    label: 'timestep — dt',
    insertText: '${1:1.0e-9}',
    detail: 'Set integration timestep',
    fullLine: true,
  },
};

export function provideCompletions(ctx: CompletionContext): CompletionItem[] {
  const trimmed = ctx.linePrefix.trimStart();
  const endsWithSpace = ctx.linePrefix.endsWith(' ') || /\s$/.test(ctx.linePrefix);
  const words = trimmed.split(/\s+/).filter(Boolean);
  const replaceRange: Range = {
    start: { line: 0, character: ctx.prefixStart },
    end: { line: 0, character: ctx.character },
  };

  // After "command " — offer arg snippet and/or style list
  if (words.length >= 1 && endsWithSpace) {
    const command = words[0];
    const items: CompletionItem[] = [];

    const argSnippet = ARG_SNIPPETS[command];
    if (argSnippet) {
      items.push(buildArgSnippetItem(command, argSnippet, {
        start: { line: 0, character: ctx.character },
        end: { line: 0, character: ctx.character },
      }));
    }

    if (words.length === 1 && isStyleCommand(command)) {
      items.push(...buildStyleItems(command, words[1] ?? ''));
    }

    return items;
  }

  // Typing first word on the line — commands + arg snippet when fully matched
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
        textEdit: {
          range: replaceRange,
          newText: cmd,
        },
      });

      // Offer arg snippet when the typed prefix fully matches a command
      if (ctx.prefix === cmd && ARG_SNIPPETS[cmd]) {
        items.push(buildCommandSnippetItem(cmd, ARG_SNIPPETS[cmd], replaceRange));
      }
    }

    return items;
  }

  // Typing second token on a style command line (e.g. "fix ad")
  if (words.length === 2 && !endsWithSpace && isStyleCommand(words[0])) {
    const stylePrefix = words[1] ?? '';
    return buildStyleItems(words[0], stylePrefix).map((item) => ({
      ...item,
      textEdit: {
        range: replaceRange,
        newText: item.label,
      },
    }));
  }

  return [];
}

function buildCommandSnippetItem(
  command: string,
  snippet: (typeof ARG_SNIPPETS)[string],
  replaceRange: Range
): CompletionItem {
  const newText = snippet.fullLine
    ? `${command} ${snippet.insertText}`
    : `${command} ${snippet.insertText}`;

  return {
    label: snippet.label,
    kind: CompletionItemKind.Snippet,
    detail: snippet.detail,
    sortText: `0_${command}`,
    filterText: command,
    insertText: newText,
    insertTextFormat: InsertTextFormat.Snippet,
    textEdit: {
      range: replaceRange,
      newText,
    },
  };
}

function buildArgSnippetItem(
  command: string,
  snippet: (typeof ARG_SNIPPETS)[string],
  range: Range
): CompletionItem {
  return {
    label: snippet.label,
    kind: CompletionItemKind.Snippet,
    detail: snippet.detail,
    sortText: `0_${command}_args`,
    insertText: snippet.insertText,
    insertTextFormat: InsertTextFormat.Snippet,
    textEdit: {
      range,
      newText: snippet.insertText,
    },
  };
}

function buildStyleItems(family: string, prefix: string): CompletionItem[] {
  return getStyles(family)
    .filter((style) => !prefix || style.startsWith(prefix))
    .map((style) => ({
      label: style,
      kind: CompletionItemKind.Method,
      detail: `${family} style`,
      sortText: `0_${style}`,
    }));
}

import commandsFull from '../schema/commands-full.json';

const COMMAND_DOCS: Record<string, string> = Object.fromEntries(
  (commandsFull as Array<{ command: string; description?: string }>)
    .filter((c) => c.description)
    .map((c) => [c.command, c.description as string])
);

export function provideHover(word: string, docBaseUrl: string): { contents: MarkupContent } | null {
  const doc = COMMAND_DOCS[word];
  if (doc) {
    const url = `${docBaseUrl}/${word}.html`;
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${word}**\n\n${doc}\n\n[SPARTA manual](${url})`,
      },
    };
  }

  for (const [family, styleList] of Object.entries(getStylesMap())) {
    if (styleList.includes(word)) {
      const slug =
        family === 'fix' || family === 'compute'
          ? `${family}_${word.replace(/\//g, '_')}`
          : word;
      const url = `${docBaseUrl}/${slug}.html`;
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${family} style: ${word}**\n\n[SPARTA manual](${url})`,
        },
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
  const before = line.slice(0, character);
  const match = before.match(/([a-zA-Z_][\w./]*)$/);
  return match?.[1];
}

export function getPrefixStart(line: string, character: number): number {
  const before = line.slice(0, character);
  const match = before.match(/([a-zA-Z_][\w./]*)$/);
  if (!match) {
    return character;
  }
  return character - match[1].length;
}
