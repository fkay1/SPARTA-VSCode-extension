import commands from './schema/commands.json';
import styles from './schema/styles.json';
import { createEmptyIdRegistry, IdRegistry } from './id-registry';
import { LexDiagnostic, LogicalLine, tokenizeLine } from './lexer';

export interface ParsedCommand {
  command: string;
  args: string[];
  line: number;
  endLine: number;
  raw: string;
}

export interface SimState {
  boxExist: boolean;
  gridExist: boolean;
  surfsExist: boolean;
  particlesExist: boolean;
  dimension: 2 | 3 | null;
}

export interface ParseDiagnostic extends LexDiagnostic {
  line: number;
}

export interface ParseResult {
  commands: ParsedCommand[];
  diagnostics: ParseDiagnostic[];
  state: SimState;
  idRegistry: IdRegistry;
}

export type { IdRegistry } from './id-registry';
export { createEmptyIdRegistry } from './id-registry';

const COMMAND_SET = new Set<string>(commands as string[]);
const STYLE_MAP = styles as Record<string, string[]>;

export function createInitialState(): SimState {
  return {
    boxExist: false,
    gridExist: false,
    surfsExist: false,
    particlesExist: false,
    dimension: null,
  };
}

export function parseDocument(
  logicalLines: LogicalLine[],
  validateOrdering = true
): ParseResult {
  const parsed: ParsedCommand[] = [];
  const diagnostics: ParseDiagnostic[] = [];
  const state = createInitialState();
  const definedVars = new Set<string>();
  const fixIds = new Map<string, number>();
  const computeIds = new Map<string, number>();
  const regionIds = new Map<string, number>();
  const surfCollideIds = new Map<string, number>();
  const surfReactIds = new Map<string, number>();

  for (const line of logicalLines) {
    const content = line.text.trim();
    if (!content || content.startsWith('#')) {
      continue;
    }

    const { tokens, diagnostics: tokenDiags } = tokenizeLine(line.text);
    for (const d of tokenDiags) {
      diagnostics.push({ ...d, line: line.startLine });
    }
    if (tokens.length === 0) {
      continue;
    }

    const command = tokens[0].text;
    const args = tokens.slice(1).map((t) => t.text);
    parsed.push({
      command,
      args,
      line: line.startLine,
      endLine: line.endLine,
      raw: line.text,
    });

    if (!COMMAND_SET.has(command)) {
      diagnostics.push({
        message: `Unknown command: ${command}`,
        line: line.startLine,
        code: 'sparta/parse/unknown-command',
        severity: 'error',
      });
      continue;
    }

    if (validateOrdering) {
      diagnostics.push(...checkOrdering(command, line.startLine, state));
    }

    updateState(command, args, state);
    collectReferenceDiagnostics(command, args, line.startLine, {
      definedVars,
      fixIds,
      computeIds,
      regionIds,
      surfCollideIds,
      surfReactIds,
      diagnostics,
    });
  }

  return {
    commands: parsed,
    diagnostics,
    state,
    idRegistry: {
      fix: [...fixIds.keys()],
      compute: [...computeIds.keys()],
      region: [...regionIds.keys()],
      surf_collide: [...surfCollideIds.keys()],
      surf_react: [...surfReactIds.keys()],
    },
  };
}

function checkOrdering(
  command: string,
  line: number,
  state: SimState
): ParseDiagnostic[] {
  const diags: ParseDiagnostic[] = [];

  const requireBox: Record<string, string> = {
    create_grid: 'Cannot create grid before simulation box is defined',
    read_grid: 'Cannot read grid before simulation box is defined',
    fix: 'Fix command before simulation box is defined',
    create_particles: 'Cannot create particles before simulation box is defined',
  };

  const requireGrid: Record<string, string> = {
    read_surf: 'Cannot read_surf before grid is defined',
    read_isurf: 'Cannot read_isurf before grid is defined',
    create_particles: 'Cannot create particles before grid is defined',
    balance_grid: 'Cannot balance grid before grid is defined',
    run: 'Run command before grid is defined',
    write_grid: 'Cannot write grid when grid is not defined',
  };

  if (!state.boxExist && requireBox[command]) {
    diags.push({
      message: requireBox[command],
      line,
      code: 'sparta/order/box-required',
      severity: 'error',
    });
  }

  if (!state.gridExist && requireGrid[command]) {
    diags.push({
      message: requireGrid[command],
      line,
      code: 'sparta/order/grid-required',
      severity: 'error',
    });
  }

  if (state.boxExist && command === 'create_box') {
    diags.push({
      message: 'Cannot create_box after simulation box is defined',
      line,
      code: 'sparta/order/duplicate-box',
      severity: 'error',
    });
  }

  if (state.gridExist && (command === 'create_grid' || command === 'read_grid')) {
    diags.push({
      message: 'Cannot create/read grid when grid is already defined',
      line,
      code: 'sparta/order/duplicate-grid',
      severity: 'error',
    });
  }

  if (state.particlesExist && command === 'read_surf') {
    diags.push({
      message: 'Cannot read_surf after particles are defined',
      line,
      code: 'sparta/order/read-surf-after-particles',
      severity: 'error',
    });
  }

  if (state.boxExist && command === 'boundary') {
    diags.push({
      message: 'Boundary command after simulation box is defined',
      line,
      code: 'sparta/order/boundary-after-box',
      severity: 'warning',
    });
  }

  return diags;
}

function updateState(command: string, args: string[], state: SimState): void {
  switch (command) {
    case 'dimension':
      if (args[0] === '2') {
        state.dimension = 2;
      } else if (args[0] === '3') {
        state.dimension = 3;
      }
      break;
    case 'create_box':
    case 'read_restart':
      state.boxExist = true;
      break;
    case 'create_grid':
    case 'read_grid':
      state.gridExist = true;
      break;
    case 'read_surf':
    case 'read_isurf':
    case 'create_isurf':
      state.surfsExist = true;
      break;
    case 'create_particles':
    case 'read_particles':
      state.particlesExist = true;
      break;
    case 'clear':
      Object.assign(state, createInitialState());
      break;
    default:
      break;
  }
}

interface RefContext {
  definedVars: Set<string>;
  fixIds: Map<string, number>;
  computeIds: Map<string, number>;
  regionIds: Map<string, number>;
  surfCollideIds: Map<string, number>;
  surfReactIds: Map<string, number>;
  diagnostics: ParseDiagnostic[];
}

function registerIdStyle(
  command: string,
  args: string[],
  line: number,
  ctx: RefContext
): void {
  if (args.length < 1) {
    return;
  }
  const id = args[0];
  const style = args[1];

  switch (command) {
    case 'fix': {
      if (ctx.fixIds.has(id)) {
        ctx.diagnostics.push({
          message: `Fix ID "${id}" already defined`,
          line,
          code: 'sparta/ref/duplicate-fix-id',
          severity: 'warning',
        });
      }
      ctx.fixIds.set(id, line);
      if (style) {
        validateStyle('fix', style, line, ctx.diagnostics);
      }
      break;
    }
    case 'compute': {
      if (ctx.computeIds.has(id)) {
        ctx.diagnostics.push({
          message: `Compute ID "${id}" already defined`,
          line,
          code: 'sparta/ref/duplicate-compute-id',
          severity: 'error',
        });
      }
      ctx.computeIds.set(id, line);
      if (style) {
        validateStyle('compute', style, line, ctx.diagnostics);
      }
      break;
    }
    case 'region': {
      ctx.regionIds.set(id, line);
      if (style) {
        validateStyle('region', style, line, ctx.diagnostics);
      }
      break;
    }
    case 'surf_collide': {
      ctx.surfCollideIds.set(id, line);
      if (style) {
        validateStyle('surf_collide', style, line, ctx.diagnostics);
      }
      break;
    }
    case 'surf_react': {
      ctx.surfReactIds.set(id, line);
      if (style) {
        validateStyle('surf_react', style, line, ctx.diagnostics);
      }
      break;
    }
  }
}

function collectReferenceDiagnostics(
  command: string,
  args: string[],
  line: number,
  ctx: RefContext
): void {
  if (command === 'variable') {
    const style = args[0];
    const name = args[1];
    if (style === 'delete') {
      for (let i = 1; i < args.length; i++) {
        ctx.definedVars.delete(args[i]);
      }
    } else if (name) {
      ctx.definedVars.add(name);
    }
    return;
  }

  if (command === 'fix' || command === 'compute' || command === 'region' ||
      command === 'surf_collide' || command === 'surf_react') {
    registerIdStyle(command, args, line, ctx);
    // fall through for ${var} checks
  } else if (command === 'collide' && args.length >= 1) {
    validateStyle('collide', args[0], line, ctx.diagnostics);
  }

  if (command === 'react' && args.length >= 1) {
    validateStyle('react', args[0], line, ctx.diagnostics);
  }

  // Undefined ${var} references in raw args
  for (const arg of args) {
    for (const match of arg.matchAll(/\$\{([^}]+)\}/g)) {
      const varName = match[1];
      if (!ctx.definedVars.has(varName)) {
        ctx.diagnostics.push({
          message: `Undefined variable: \${${varName}}`,
          line,
          code: 'sparta/ref/undefined-variable',
          severity: 'warning',
        });
      }
    }
  }
}

function validateStyle(
  family: string,
  style: string,
  line: number,
  diagnostics: ParseDiagnostic[]
): void {
  const allowed = STYLE_MAP[family];
  if (!allowed) {
    return;
  }
  const normalized = style.replace(/\/kk$/, '');
  if (!allowed.includes(normalized) && !allowed.includes(style)) {
    diagnostics.push({
      message: `Unrecognized ${family} style: ${style}`,
      line,
      code: `sparta/args/unknown-${family}-style`,
      severity: 'error',
    });
  }
}

export function getCommands(): string[] {
  return [...COMMAND_SET].sort();
}

export function getStyles(family: string): string[] {
  return STYLE_MAP[family] ?? [];
}

export function isStyleCommand(command: string): boolean {
  return command in STYLE_MAP;
}
