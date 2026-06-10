/** Commands with syntax: command ID style args */
import type { IdRegistry } from './id-registry';

export type { IdRegistry };

export const ID_STYLE_COMMANDS = [
  'fix',
  'compute',
  'region',
  'surf_collide',
  'surf_react',
] as const;

export type IdStyleCommand = (typeof ID_STYLE_COMMANDS)[number];

/** Commands with syntax: command style args (no user ID) */
export const STYLE_FIRST_COMMANDS = [
  'collide',
  'react',
  'balance_grid',
  'package',
  'suffix',
  'units',
  'echo',
] as const;

export type CompletionStage = 'user-id' | 'style' | 'style-args';

export interface LineArgState {
  command: string;
  /** Complete args before the token at the cursor */
  argsBefore: string[];
  /** Index of the argument being edited (0-based, after command) */
  argIndex: number;
  /** Partial text of the current argument */
  partial: string;
  endsWithSpace: boolean;
}

export function getLineArgState(linePrefix: string): LineArgState | null {
  const trimmed = linePrefix.trimStart();
  if (!trimmed) {
    return null;
  }
  const endsWithSpace = /\s$/.test(linePrefix);
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }

  const command = words[0];
  const argWords = words.slice(1);

  if (endsWithSpace) {
    return {
      command,
      argsBefore: argWords,
      argIndex: argWords.length,
      partial: '',
      endsWithSpace: true,
    };
  }

  if (argWords.length === 0) {
    return null;
  }

  return {
    command,
    argsBefore: argWords.slice(0, -1),
    argIndex: argWords.length - 1,
    partial: argWords[argWords.length - 1] ?? '',
    endsWithSpace: false,
  };
}

export function isIdStyleCommand(command: string): command is IdStyleCommand {
  return (ID_STYLE_COMMANDS as readonly string[]).includes(command);
}

export function styleFamilyForCommand(command: IdStyleCommand): string {
  return command;
}

export function idRegistryKey(command: IdStyleCommand): keyof IdRegistry {
  return command;
}

/** Which completion stage applies for the current cursor position. */
export function resolveStage(state: LineArgState): CompletionStage | null {
  if (isIdStyleCommand(state.command)) {
    if (state.argIndex === 0) {
      return 'user-id';
    }
    if (state.argIndex === 1) {
      return 'style';
    }
    if (state.argIndex >= 2) {
      return 'style-args';
    }
  }

  if ((STYLE_FIRST_COMMANDS as readonly string[]).includes(state.command)) {
    if (state.argIndex === 0) {
      return 'style';
    }
    if (state.argIndex >= 1) {
      return 'style-args';
    }
  }

  return null;
}

const WORD_RE = /[a-zA-Z_][\w./]*/g;

export function getWordRangeAtPosition(
  line: string,
  character: number
): { word: string; start: number; end: number } | undefined {
  if (character < 0) {
    return undefined;
  }

  const clamped = Math.min(character, line.length);
  WORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_RE.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (clamped >= start && clamped <= end) {
      return { word: match[0], start, end };
    }
  }
  return undefined;
}

/** Line argument state for a cursor position (includes the word under the cursor). */
export function getLineArgStateAt(line: string, character: number): LineArgState | null {
  const wordRange = getWordRangeAtPosition(line, character);
  const prefix = wordRange ? line.slice(0, wordRange.end) : line.slice(0, character);
  return getLineArgState(prefix);
}
