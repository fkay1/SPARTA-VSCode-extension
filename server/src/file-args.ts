/** Which argument index (0-based, after command) expects a file path. */
export interface FileArgRule {
  argIndex: number;
  extensions?: string[];
  /** When set, rule applies only if style arg matches (e.g. collide vss). */
  style?: string;
  /** Keyword whose value is a file (e.g. species vibfile). */
  keyword?: string;
}

export const FILE_ARG_RULES: Record<string, FileArgRule[]> = {
  species: [{ argIndex: 0, extensions: ['.species'] }],
  collide: [{ argIndex: 2, extensions: ['.vss'], style: 'vss' }],
  react: [{ argIndex: 2, extensions: ['.tce'], style: 'tce' }],
  surf_react: [{ argIndex: 2, extensions: ['.surf'] }],
  read_surf: [{ argIndex: 0, extensions: ['.surf', '.sdata'] }],
  read_grid: [{ argIndex: 0, extensions: ['.grid'] }],
  read_isurf: [{ argIndex: 0 }],
  read_particles: [{ argIndex: 0 }],
  read_restart: [{ argIndex: 0, extensions: ['.restart'] }],
  include: [{ argIndex: 0 }],
  jump: [{ argIndex: 0 }],
  write_surf: [{ argIndex: 0, extensions: ['.surf'] }],
  write_grid: [{ argIndex: 0, extensions: ['.grid'] }],
  write_restart: [{ argIndex: 0, extensions: ['.restart'] }],
  restart: [{ argIndex: 0, extensions: ['.restart'] }],
  dump: [{ argIndex: 2 }],
};

export interface ArgContext {
  command: string;
  args: string[];
  argIndex: number;
  partial: string;
  endsWithSpace: boolean;
}

/** Determine which argument is being completed on the current line. */
export function getArgContext(linePrefix: string): ArgContext | null {
  const trimmed = linePrefix.trimStart();
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
      args: argWords,
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
    args: argWords.slice(0, -1),
    argIndex: argWords.length - 1,
    partial: argWords[argWords.length - 1] ?? '',
    endsWithSpace: false,
  };
}

export function getFileRule(ctx: ArgContext): FileArgRule | null {
  const rules = FILE_ARG_RULES[ctx.command];
  if (!rules) {
    return null;
  }

  for (const rule of rules) {
    if (rule.argIndex !== ctx.argIndex) {
      continue;
    }
    if (rule.style !== undefined) {
      const styleArg = ctx.command === 'collide' || ctx.command === 'react' ? ctx.args[0] : undefined;
      if (styleArg !== rule.style) {
        continue;
      }
    }
    return rule;
  }

  // species vibfile keyword value
  if (ctx.command === 'species') {
    const vibIdx = ctx.args.indexOf('vibfile');
    if (vibIdx >= 0 && ctx.argIndex === vibIdx + 1) {
      return { argIndex: ctx.argIndex, extensions: ['.species.vib', '.vib'] };
    }
  }

  return null;
}
