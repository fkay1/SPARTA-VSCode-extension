/**
 * Parse SPARTA [Syntax:] blocks into structured argument definitions.
 * Used by extract-schema.ts and unit tests.
 */

export interface ParameterDef {
  names: string[];
  description: string;
  /** 0-based index in the top-level syntax template (after command name). */
  templateIndex?: number;
}

export interface KeywordValueDef {
  name: string;
  description: string;
}

export interface KeywordDef {
  name: string;
  description: string;
  values?: KeywordValueDef[];
}

export interface StyleVariantDef {
  styles: string[];
  template: string[];
  parameters: ParameterDef[];
}

export interface ParsedSyntax {
  template: string[];
  parameters: ParameterDef[];
  keywords: KeywordDef[];
  styleVariants: StyleVariantDef[];
}

const TEMPLATE_SKIP = new Set(['...', ':pre', ':ul', ':ule', ':ulb,l', ':l']);

export function normalizeSyntaxText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^:pre\n?/, '')
    .replace(/:ule$/m, '')
    .replace(/:ulb,l\n?/g, '')
    .replace(/:pre$/m, '')
    .trim();
}

export function parseTemplateLine(line: string): string[] {
  const cleaned = line
    .replace(/:pre.*$/i, '')
    .replace(/:ul.*$/i, '')
    .replace(/:l$/i, '')
    .trim();
  return cleaned
    .split(/\s+/)
    .filter((token) => token && !TEMPLATE_SKIP.has(token));
}

function stripLineSuffix(line: string): string {
  return line
    .replace(/\s*:pre\s*$/i, '')
    .replace(/\s*:ul.*$/i, '')
    .replace(/\s*:l\s*$/i, '')
    .trim();
}

function parseDefinitionLine(line: string): ParameterDef | null {
  const cleaned = stripLineSuffix(line);
  const eq = cleaned.indexOf('=');
  if (eq <= 0) {
    return null;
  }

  const lhs = cleaned.slice(0, eq).trim();
  const rhs = cleaned.slice(eq + 1).trim();
  if (!lhs || !rhs) {
    return null;
  }

  if (/^keyword$/i.test(lhs) || /^zero or more/i.test(lhs)) {
    return null;
  }

  const names = lhs
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length === 0) {
    return null;
  }

  return { names, description: rhs };
}

function parseStyleVariantLine(line: string): { styles: string[]; template: string[] } | null {
  const cleaned = stripLineSuffix(line);
  const argsIdx = cleaned.search(/\bargs\s*=/i);
  if (argsIdx < 0) {
    return null;
  }

  const head = cleaned.slice(0, argsIdx);
  const tail = cleaned.slice(argsIdx).replace(/^args\s*=\s*/i, '');
  const styles = [...head.matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim());
  if (styles.length === 0) {
    return null;
  }

  return {
    styles,
    template: parseTemplateLine(tail),
  };
}

function parseKeywordLine(line: string): KeywordDef | null {
  const cleaned = stripLineSuffix(line);
  const match = cleaned.match(/^keyword\s*=\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const names = [...match[1].matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim());
  if (names.length === 0) {
    return null;
  }
  return {
    name: names[0],
    description: `Keyword: ${names.join(' | ')}`,
  };
}

function parseKeywordValueLine(line: string): { keyword: string; values: KeywordValueDef[] } | null {
  const cleaned = stripLineSuffix(line);
  const match = cleaned.match(/^\{([^}]+)\}\s+value\s*=\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const keyword = match[1].trim();
  const values = [...match[2].matchAll(/\{([^}]+)\}/g)].map((m) => ({
    name: m[1].trim(),
    description: '',
  }));
  return { keyword, values };
}

function parseKeywordValueDetailLine(line: string): KeywordValueDef | null {
  const cleaned = stripLineSuffix(line);
  const match = cleaned.match(/^\{([^}]+)\}\s*=\s*(.+)$/);
  if (!match) {
    return null;
  }
  return { name: match[1].trim(), description: match[2].trim() };
}

function assignTemplateIndexes(template: string[], parameters: ParameterDef[]): ParameterDef[] {
  const used = new Set<number>();
  return parameters.map((param) => {
    for (let i = 0; i < template.length; i++) {
      if (used.has(i)) {
        continue;
      }
      const token = template[i].replace(/[{}]/g, '');
      if (param.names.some((n) => n.replace(/[{}]/g, '') === token)) {
        used.add(i);
        return { ...param, templateIndex: i };
      }
    }
    return param;
  });
}

function assignVariantIndexes(
  template: string[],
  parameters: ParameterDef[]
): ParameterDef[] {
  const used = new Set<number>();
  return parameters.map((param) => {
    for (let i = 0; i < template.length; i++) {
      if (used.has(i)) {
        continue;
      }
      const token = template[i].replace(/[{}]/g, '');
      if (param.names.some((n) => n.replace(/[{}]/g, '') === token)) {
        used.add(i);
        return { ...param, templateIndex: i };
      }
    }
    for (const name of param.names) {
      const normalized = name.replace(/[{}]/g, '');
      for (let i = 0; i < template.length; i++) {
        if (used.has(i)) {
          continue;
        }
        if (template[i].replace(/[{}]/g, '') === normalized) {
          used.add(i);
          return { ...param, templateIndex: i };
        }
      }
    }
    return param;
  });
}

export function parseSyntaxBlock(raw: string): ParsedSyntax {
  const text = normalizeSyntaxText(raw);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const template = lines.length > 0 ? parseTemplateLine(lines[0]) : [];
  const parameters: ParameterDef[] = [];
  const keywords: KeywordDef[] = [];
  const styleVariants: StyleVariantDef[] = [];

  let currentVariant: StyleVariantDef | null = null;
  let currentKeyword: KeywordDef | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    const kwLine = parseKeywordLine(line);
    if (kwLine) {
      keywords.push(kwLine);
      currentKeyword = kwLine;
      currentVariant = null;
      continue;
    }

    const kwValue = parseKeywordValueLine(line);
    if (kwValue) {
      const existing: KeywordDef | null | undefined =
        keywords.find((k) => k.name === kwValue.keyword) ?? currentKeyword;
      if (existing) {
        existing.values = kwValue.values;
        currentKeyword = existing;
      }
      currentVariant = null;
      continue;
    }

    const kwValueDetail = parseKeywordValueDetailLine(line);
    if (kwValueDetail && currentKeyword?.values) {
      const entry = currentKeyword.values.find((v) => v.name === kwValueDetail.name);
      if (entry) {
        entry.description = kwValueDetail.description;
      }
      continue;
    }

    const variantLine = parseStyleVariantLine(line);
    if (variantLine) {
      currentVariant = {
        styles: variantLine.styles,
        template: variantLine.template,
        parameters: [],
      };
      styleVariants.push(currentVariant);
      currentKeyword = null;
      continue;
    }

    const def = parseDefinitionLine(line);
    if (def) {
      if (currentVariant) {
        currentVariant.parameters.push(def);
      } else {
        parameters.push(def);
      }
      continue;
    }
  }

  for (const variant of styleVariants) {
    variant.parameters = assignVariantIndexes(variant.template, variant.parameters);
  }

  return {
    template,
    parameters: assignTemplateIndexes(template, parameters),
    keywords,
    styleVariants,
  };
}

export interface CommandArgsSchema {
  command: string;
  syntax: ParsedSyntax;
}

export interface StyleArgsSchema {
  family: string;
  style: string;
  syntax: ParsedSyntax;
}

/** Resolve positional parameter by template index, expanding comma-separated name groups. */
export function resolvePositionalParameter(
  syntax: ParsedSyntax,
  argIndex: number,
  style?: string
): ParameterDef | undefined {
  const normalizedStyle = style?.replace(/\/kk$/i, '') ?? style;

  if (normalizedStyle) {
    const variant =
      syntax.styleVariants.find((v) =>
        v.styles.some((s) => s.replace(/\/kk$/i, '') === normalizedStyle)
      ) ?? syntax.styleVariants.find((v) => v.styles.some((s) => s === style));
    if (variant) {
      for (const param of variant.parameters) {
        if (param.templateIndex === argIndex) {
          return param;
        }
        if (param.names.length > 1) {
          const start = param.templateIndex ?? -1;
          if (start >= 0 && argIndex >= start && argIndex < start + param.names.length) {
            return param;
          }
        }
      }
    }
  }

  for (const param of syntax.parameters) {
    if (param.templateIndex === argIndex) {
      return param;
    }
    if (param.names.length > 1 && param.templateIndex !== undefined) {
      const start = param.templateIndex;
      if (argIndex >= start && argIndex < start + param.names.length) {
        return param;
      }
    }
  }

  return undefined;
}

export function resolveKeyword(
  syntax: ParsedSyntax,
  word: string
): { keyword: KeywordDef; value?: KeywordValueDef } | undefined {
  const normalized = word.replace(/[{}]/g, '');
  for (const keyword of syntax.keywords) {
    if (keyword.name === normalized) {
      return { keyword };
    }
    const value = keyword.values?.find((v) => v.name === normalized);
    if (value) {
      return { keyword, value };
    }
  }
  return undefined;
}

export function resolveParameterByName(
  syntax: ParsedSyntax,
  name: string,
  style?: string
): ParameterDef | undefined {
  const normalized = name.replace(/[{}]/g, '');
  const normalizedStyle = style?.replace(/\/kk$/i, '');

  if (normalizedStyle) {
    const variant =
      syntax.styleVariants.find((v) =>
        v.styles.some((s) => s.replace(/\/kk$/i, '') === normalizedStyle)
      ) ?? syntax.styleVariants.find((v) => v.styles.some((s) => s === style));
    if (variant) {
      const hit = variant.parameters.find((p) =>
        p.names.some((n) => n.replace(/[{}]/g, '') === normalized)
      );
      if (hit) {
        return hit;
      }
    }
  }

  return syntax.parameters.find((p) =>
    p.names.some((n) => n.replace(/[{}]/g, '') === normalized)
  );
}

/** Strip leading command name from command syntax templates. */
export function normalizeCommandSyntax(command: string, syntax: ParsedSyntax): ParsedSyntax {
  if (syntax.template[0] !== command) {
    return syntax;
  }
  const offset = 1;
  return {
    ...syntax,
    template: syntax.template.slice(offset),
    parameters: syntax.parameters.map((p) => ({
      ...p,
      templateIndex:
        p.templateIndex !== undefined ? p.templateIndex - offset : undefined,
    })),
  };
}

/** Strip fix ID style / compute ID style prefix from per-style syntax templates. */
export function normalizeStyleSyntax(
  family: string,
  style: string,
  syntax: ParsedSyntax
): ParsedSyntax {
  const template = [...syntax.template];
  let offset = 0;

  while (template.length > 0) {
    const token = template[0].replace(/[{}]/g, '');
    const styleBase = style.replace(/\/kk$/i, '');
    if (
      token === family ||
      token === 'ID' ||
      token === style ||
      token === styleBase ||
      token === `${styleBase}/kk`
    ) {
      template.shift();
      offset++;
      continue;
    }
    break;
  }

  return {
    ...syntax,
    template,
    parameters: syntax.parameters
      .map((p) => ({
        ...p,
        templateIndex:
          p.templateIndex !== undefined && p.templateIndex >= offset
            ? p.templateIndex - offset
            : undefined,
      }))
      .filter((p) => p.templateIndex === undefined || p.templateIndex >= 0),
  };
}
