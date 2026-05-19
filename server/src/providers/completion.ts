import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupContent,
  MarkupKind,
} from 'vscode-languageserver';
import { getCommands, getStyles, isStyleCommand } from '../parser';

export function provideCommandCompletions(
  _linePrefix: string,
  firstWord: string | undefined
): CompletionItem[] {
  if (!firstWord) {
    return getCommands().map((cmd) => ({
      label: cmd,
      kind: CompletionItemKind.Function,
    }));
  }

  if (isStyleCommand(firstWord)) {
    const styleList = getStyles(firstWord);
    return styleList.map((style) => ({
      label: style,
      kind: CompletionItemKind.Method,
      detail: `${firstWord} style`,
    }));
  }

  return [];
}

export function provideSnippetCompletions(
  linePrefix: string,
  words: string[]
): CompletionItem[] {
  const command = words[0];
  if (!command || words.length > 1) {
    return [];
  }

  const snippets: Record<string, { label: string; insertText: string; detail: string }> = {
    fix: {
      label: 'fix ID style ...',
      insertText: 'fix ${1:ID} ${2|ablate,adapt,ave/grid,ave/time,emit/face,grid/check,halt|} $0',
      detail: 'fix command with style placeholder',
    },
    compute: {
      label: 'compute ID style ...',
      insertText: 'compute ${1:ID} ${2|grid,temp,ke/particle,boundary,gas/collision/grid|} ${3:all} $0',
      detail: 'compute command with style placeholder',
    },
    create_box: {
      label: 'create_box xmin xmax ymin ymax zmin zmax',
      insertText: 'create_box ${1:0} ${2:10} ${3:0} ${4:10} ${5:-0.5} ${6:0.5}',
      detail: 'Define simulation box',
    },
    create_grid: {
      label: 'create_grid Nx Ny Nz',
      insertText: 'create_grid ${1:20} ${2:20} ${3:1}',
      detail: 'Overlay grid on simulation box',
    },
    read_surf: {
      label: 'read_surf filename',
      insertText: 'read_surf ${1:surf.file}',
      detail: 'Read surface elements from file',
    },
    species: {
      label: 'species file ID1 ID2 ...',
      insertText: 'species ${1:air.species} ${2:N} ${3:O}',
      detail: 'Define species from file',
    },
    variable: {
      label: 'variable name equal formula',
      insertText: 'variable ${1:name} equal ${2:1.0}',
      detail: 'Define equal-style variable',
    },
    run: {
      label: 'run N',
      insertText: 'run ${1:1000}',
      detail: 'Run simulation for N timesteps',
    },
  };

  const snippet = snippets[command];
  if (!snippet) {
    return [];
  }

  const item: CompletionItem = {
    label: snippet.label,
    kind: CompletionItemKind.Snippet,
    insertText: snippet.insertText,
    insertTextFormat: InsertTextFormat.Snippet,
    detail: snippet.detail,
    filterText: command,
  };
  return [item];
}

const COMMAND_DOCS: Record<string, string> = {
  dimension: 'Set dimensionality of simulation (2 or 3).',
  create_box: 'Define the simulation domain boundaries.',
  create_grid: 'Overlay a grid on the simulation box.',
  read_surf: 'Read surface elements from a file.',
  species: 'Define species by reading a species file.',
  mixture: 'Define a mixture of species with macroscopic properties.',
  collide: 'Define a collision model.',
  fix: 'Apply an operation during timestepping.',
  compute: 'Define a diagnostic calculation.',
  run: 'Run the simulation for N timesteps.',
  variable: 'Define or delete a variable.',
  global: 'Set global simulation parameters (nrho, fnum, gridcut, ...).',
  boundary: 'Set boundary conditions on simulation box faces.',
  timestep: 'Set the integration timestep.',
};

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
      const slug = family === 'fix' || family === 'compute'
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
  for (const family of ['fix', 'compute', 'collide', 'react', 'region', 'surf_collide', 'surf_react']) {
    result[family] = getStyles(family);
  }
  return result;
}

export function getWordAtPosition(line: string, character: number): string | undefined {
  const before = line.slice(0, character);
  const match = before.match(/([a-zA-Z_][\w./]*)$/);
  return match?.[1];
}

export function getLineWords(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}
