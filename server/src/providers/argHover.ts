import { MarkupContent, MarkupKind } from 'vscode-languageserver';
import commandArgsData from '../schema/command-args.json';
import styleArgsData from '../schema/style-args.json';
import {
  ID_STYLE_COMMANDS,
  LineArgState,
  STYLE_FIRST_COMMANDS,
} from '../completion-stages';
import { escapeMarkdown, plainDocText } from '../doc-markdown';
import {
  ParsedSyntax,
  ParameterDef,
  resolveKeyword,
  resolveParameterByName,
  resolvePositionalParameter,
  type CommandArgsSchema,
  type StyleArgsSchema,
} from '../parse-syntax';

const COMMAND_ARGS = new Map<string, ParsedSyntax>(
  (commandArgsData as CommandArgsSchema[]).map((entry) => [entry.command, entry.syntax])
);

const STYLE_ARGS = new Map<string, ParsedSyntax>(
  (styleArgsData as StyleArgsSchema[]).map((entry) => [
    `${entry.family}:${entry.style}`,
    entry.syntax,
  ])
);

function formatParamHover(param: ParameterDef, argIndex?: number): MarkupContent {
  const name = param.names.length > 1 ? param.names.join(', ') : (param.names[0] ?? 'argument');
  const desc = escapeMarkdown(plainDocText(param.description, 600));
  const indexNote =
    argIndex !== undefined ? `\n\n*Argument ${argIndex + 1} of command*` : '';
  return {
    kind: MarkupKind.Markdown,
    value: `**${escapeMarkdown(name)}**\n\n${desc}${indexNote}`,
  };
}

function formatKeywordHover(
  keyword: string,
  description: string,
  valueDescription?: string
): MarkupContent {
  const parts = [
    `**keyword: ${escapeMarkdown(keyword)}**`,
    escapeMarkdown(plainDocText(description, 400)),
  ];
  if (valueDescription) {
    parts.push(escapeMarkdown(plainDocText(valueDescription, 400)));
  }
  return { kind: MarkupKind.Markdown, value: parts.join('\n\n') };
}

function lookupStyleSyntax(family: string, style: string): ParsedSyntax | undefined {
  return (
    STYLE_ARGS.get(`${family}:${style}`) ??
    STYLE_ARGS.get(`${family}:${style.replace(/\/kk$/i, '')}`)
  );
}

function referencedCommandFromDescription(description: string): string | undefined {
  const match = description.match(/"([a-z_]+)"_([a-z_]+)\.html/i);
  if (!match) {
    return undefined;
  }
  if (COMMAND_ARGS.has(match[2])) {
    return match[2];
  }
  const fromLabel = match[1].replace(/ /g, '_');
  if (COMMAND_ARGS.has(fromLabel)) {
    return fromLabel;
  }
  return undefined;
}

function resolveInSyntax(
  syntax: ParsedSyntax,
  argIndex: number,
  style: string | undefined,
  word: string
): MarkupContent | null {
  const keywordHit = resolveKeyword(syntax, word);
  if (keywordHit) {
    if (keywordHit.value) {
      return formatKeywordHover(
        keywordHit.keyword.name,
        keywordHit.keyword.description,
        keywordHit.value.description
      );
    }
    return formatKeywordHover(keywordHit.keyword.name, keywordHit.keyword.description);
  }

  const byName = resolveParameterByName(syntax, word, style);
  if (byName) {
    return formatParamHover(byName);
  }

  const positional = resolvePositionalParameter(syntax, argIndex, style);
  if (positional) {
    return formatParamHover(positional, argIndex);
  }

  return null;
}

export function provideArgHover(state: LineArgState, word: string): MarkupContent | null {
  const commandSyntax = COMMAND_ARGS.get(state.command);
  if (!commandSyntax) {
    return null;
  }

  const isIdStyle = (ID_STYLE_COMMANDS as readonly string[]).includes(state.command);
  const isStyleFirst = (STYLE_FIRST_COMMANDS as readonly string[]).includes(state.command);

  if (isIdStyle) {
    if (state.argIndex <= 1) {
      const hit = resolveInSyntax(commandSyntax, state.argIndex, undefined, word);
      if (hit) {
        return hit;
      }
    }

    const style = state.argsBefore[1];
    if (style && state.argIndex >= 2) {
      const styleArgIndex = state.argIndex - 2;
      const styleSyntax = lookupStyleSyntax(state.command, style);
      if (styleSyntax) {
        const hit = resolveInSyntax(styleSyntax, styleArgIndex, undefined, word);
        if (hit) {
          return hit;
        }

        const argsParam = styleSyntax.parameters.find((p) => p.names.includes('args'));
        const refCmd = argsParam
          ? referencedCommandFromDescription(argsParam.description)
          : undefined;
        if (refCmd) {
          const refSyntax = COMMAND_ARGS.get(refCmd);
          if (refSyntax) {
            const refHit = resolveInSyntax(refSyntax, styleArgIndex, undefined, word);
            if (refHit) {
              return refHit;
            }
          }
        }
      }

      const variantHit = resolveInSyntax(commandSyntax, styleArgIndex, style, word);
      if (variantHit) {
        return variantHit;
      }
    }
  } else if (isStyleFirst) {
    if (state.argIndex === 0) {
      const hit = resolveInSyntax(commandSyntax, 0, undefined, word);
      if (hit) {
        return hit;
      }
    }

    const style = state.argsBefore[0];
    if (style && state.argIndex >= 1) {
      const styleArgIndex = state.argIndex - 1;
      const styleSyntax = lookupStyleSyntax(state.command, style);
      if (styleSyntax) {
        const hit = resolveInSyntax(styleSyntax, styleArgIndex, undefined, word);
        if (hit) {
          return hit;
        }
      }

      const variantHit = resolveInSyntax(commandSyntax, styleArgIndex, style, word);
      if (variantHit) {
        return variantHit;
      }
    }
  } else {
    const hit = resolveInSyntax(commandSyntax, state.argIndex, undefined, word);
    if (hit) {
      return hit;
    }
  }

  return null;
}

export function getCommandArgsSummary(): {
  commands: number;
  parameters: number;
  keywords: number;
  styleVariants: number;
  styleDocs: number;
} {
  let parameters = 0;
  let keywords = 0;
  let styleVariants = 0;
  for (const syntax of COMMAND_ARGS.values()) {
    parameters += syntax.parameters.length;
    keywords += syntax.keywords.length;
    styleVariants += syntax.styleVariants.length;
  }
  return {
    commands: COMMAND_ARGS.size,
    parameters,
    keywords,
    styleVariants,
    styleDocs: STYLE_ARGS.size,
  };
}
