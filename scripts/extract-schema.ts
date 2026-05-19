#!/usr/bin/env npx tsx
/**
 * Extract SPARTA command schema from doc/*.txt into server/src/schema/
 *
 * Usage: npm run extract-schema [-- --doc=../sparta/doc]
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CommandSchema {
  command: string;
  syntax?: string;
  description?: string;
  restrictions?: string;
  examples?: string[];
  docFile: string;
}

export interface StyleSchema {
  family: string;
  style: string;
  description?: string;
  docFile: string;
}

const SCRIPT_DIR = __dirname;
const DEFAULT_DOC_DIR = path.resolve(SCRIPT_DIR, '../../sparta/doc');
const OUT_DIR = path.resolve(SCRIPT_DIR, '../server/src/schema');

function parseArgs(): { docDir: string } {
  const docArg = process.argv.find((a) => a.startsWith('--doc='));
  return {
    docDir: docArg ? path.resolve(docArg.slice('--doc='.length)) : DEFAULT_DOC_DIR,
  };
}

/** Extract "command name"_file.html link targets from a doc block */
function extractQuotedLinks(text: string): string[] {
  const results: string[] = [];
  const re = /"([^"]+)"_[\w./]+\.html/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

/** Normalize style name: strip (k) Kokkos suffix annotation */
function normalizeStyle(name: string): string {
  return name.replace(/\s*\([a-z]\)\s*$/i, '').trim();
}

export function readSectionCommands(docDir: string): {
  commands: string[];
  styleSections: Record<string, string[]>;
} {
  const file = path.join(docDir, 'Section_commands.txt');
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  const alphaMatch = text.match(
    /3\.5 Individual commands[\s\S]*?:tb\(c=6,ea=c\)/
  );
  const commandBlock = alphaMatch ? alphaMatch[0] : '';
  const rawCommands = extractQuotedLinks(commandBlock);
  const commands = [...new Set(rawCommands.map(normalizeStyle))].filter(
    (c) => !c.includes(' ') || c === 'dump image' || c === 'dump movie'
  );

  const styleSections: Record<string, string[]> = {};
  const sectionDefs: [string, RegExp][] = [
    ['fix', /Fix styles :h4([\s\S]*?):line\n\nCompute styles :h4/],
    ['compute', /Compute styles :h4([\s\S]*?):line\n\nCollide styles :h4/],
    ['collide', /Collide styles :h4([\s\S]*?):line\n\nSurface collide styles :h4/],
    ['surf_collide', /Surface collide styles :h4([\s\S]*?):line\n\nSurface reaction styles :h4/],
    ['surf_react', /Surface reaction styles :h4([\s\S]*?):tb\(c=2,ea=c\)/],
  ];

  for (const [family, re] of sectionDefs) {
    const match = text.match(re);
    if (match) {
      styleSections[family] = [
        ...new Set(
          extractQuotedLinks(match[1])
            .map(normalizeStyle)
            .filter((s) => !s.includes('package') && s !== family)
        ),
      ];
    }
  }

  styleSections['region'] = ['block', 'cylinder', 'plane', 'sphere', 'union', 'intersect'];
  styleSections['react'] = ['tce', 'tce/qk'];

  // dump styles from dump.txt list if needed
  styleSections['dump'] = ['image', 'movie'];

  return { commands, styleSections };
}

function parseCommandDoc(docDir: string, command: string): CommandSchema | null {
  const fileName = command.replace(/ /g, '_') + '.txt';
  const filePath = path.join(docDir, fileName);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const syntax = extractBlock(text, '[Syntax:]');
  const description = extractDescription(text);
  const restrictions = extractBlock(text, '[Restrictions:]');
  const examples = extractExamples(text);

  return {
    command,
    syntax,
    description,
    restrictions,
    examples,
    docFile: fileName,
  };
}

function extractBlock(text: string, header: string): string | undefined {
  const idx = text.indexOf(header);
  if (idx < 0) {
    return undefined;
  }
  const after = text.slice(idx + header.length);
  const end = after.search(/\n\[|\n:line\n/);
  const block = (end >= 0 ? after.slice(0, end) : after).trim();
  return block
    .replace(/^:pre\n?/, '')
    .replace(/:ule$/m, '')
    .replace(/:ulb,l\n?/g, '')
    .replace(/:l\n?/g, '\n')
    .replace(/:pre$/m, '')
    .trim();
}

function extractDescription(text: string): string | undefined {
  const idx = text.indexOf('[Description:]');
  if (idx < 0) {
    return undefined;
  }
  const after = text.slice(idx + '[Description:]'.length);
  const end = after.search(/\n:line\n|\n\[Restrictions:\]|\n\[Related/);
  const block = (end >= 0 ? after.slice(0, end) : after).trim();
  const firstPara = block.split(/\n\n+/)[0]?.replace(/\n/g, ' ').trim();
  return firstPara || undefined;
}

function extractExamples(text: string): string[] | undefined {
  const block = extractBlock(text, '[Examples:]');
  if (!block) {
    return undefined;
  }
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseStyleDocs(
  docDir: string,
  family: string,
  styles: string[]
): StyleSchema[] {
  const prefix =
    family === 'fix' || family === 'compute' || family === 'surf_collide' || family === 'surf_react'
      ? `${family}_`
      : family === 'region'
        ? 'region_'
        : '';

  return styles.map((style) => {
    const slug = style.replace(/\//g, '_');
    const candidates = [
      `${prefix}${slug}.txt`,
      `${family}_${slug}.txt`,
      `fix_${slug}.txt`,
      `compute_${slug}.txt`,
    ];
    let docFile = '';
    let description: string | undefined;
    for (const c of candidates) {
      const fp = path.join(docDir, c);
      if (fs.existsSync(fp)) {
        docFile = c;
        description = extractDescription(fs.readFileSync(fp, 'utf8'));
        break;
      }
    }
    return { family, style, description, docFile };
  });
}

function validateAgainstSource(docDir: string, styles: Record<string, string[]>): void {
  const srcDir = path.resolve(docDir, '../src');
  if (!fs.existsSync(srcDir)) {
    console.warn('Warning: SPARTA src/ not found, skipping source validation');
    return;
  }

  const headers = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith('.h'))
    .map((f) => fs.readFileSync(path.join(srcDir, f), 'utf8'))
    .join('\n');

  const fixFromSrc = [...headers.matchAll(/FixStyle\(([^,]+),/g)].map((m) => m[1].trim());
  const computeFromSrc = [...headers.matchAll(/ComputeStyle\(([^,]+),/g)].map((m) => m[1].trim());

  diffStyles('fix', styles.fix ?? [], fixFromSrc);
  diffStyles('compute', styles.compute ?? [], computeFromSrc);
}

function diffStyles(family: string, fromDoc: string[], fromSrc: string[]): void {
  const normalize = (s: string) => s.replace(/\//g, '').toLowerCase();
  const docSet = new Set(fromDoc.map(normalize));
  const onlyDoc = fromDoc.filter((s) => !fromSrc.some((x) => normalize(x) === normalize(s)));
  const onlySrc = fromSrc.filter((s) => !fromDoc.some((x) => normalize(x) === normalize(s)));
  if (onlyDoc.length) {
    console.warn(`  ${family}: in doc only: ${onlyDoc.join(', ')}`);
  }
  if (onlySrc.length) {
    console.warn(`  ${family}: in src only: ${onlySrc.join(', ')}`);
  }
}

function main(): void {
  const { docDir } = parseArgs();
  if (!fs.existsSync(docDir)) {
    console.error(`Doc directory not found: ${docDir}`);
    process.exit(1);
  }

  console.log(`Extracting schema from ${docDir}`);

  const { commands: rawCommands, styleSections } = readSectionCommands(docDir);

  // Normalize multi-word dump variants to single command
  const commands = [
    ...new Set(
      rawCommands
        .map((c) => (c === 'dump image' || c === 'dump movie' ? 'dump' : c))
        .filter((c) => c !== 'dump movie')
    ),
  ].sort();

  const commandSchemas: CommandSchema[] = [];
  for (const cmd of commands) {
    const schema = parseCommandDoc(docDir, cmd);
    if (schema) {
      commandSchemas.push(schema);
    } else {
      commandSchemas.push({ command: cmd, docFile: `${cmd.replace(/ /g, '_')}.txt` });
    }
  }

  const styleSchemas: Record<string, StyleSchema[]> = {};
  for (const [family, list] of Object.entries(styleSections)) {
    styleSchemas[family] = parseStyleDocs(docDir, family, list);
  }

  const stylesFlat: Record<string, string[]> = {};
  for (const [family, list] of Object.entries(styleSections)) {
    stylesFlat[family] = list;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'commands.json'), JSON.stringify(commands, null, 2) + '\n');
  fs.writeFileSync(
    path.join(OUT_DIR, 'commands-full.json'),
    JSON.stringify(commandSchemas, null, 2) + '\n'
  );
  fs.writeFileSync(path.join(OUT_DIR, 'styles.json'), JSON.stringify(stylesFlat, null, 2) + '\n');
  fs.writeFileSync(
    path.join(OUT_DIR, 'styles-full.json'),
    JSON.stringify(styleSchemas, null, 2) + '\n'
  );

  console.log(`  Commands: ${commands.length} (${commandSchemas.filter((c) => c.syntax).length} with syntax)`);
  for (const [family, list] of Object.entries(stylesFlat)) {
    console.log(`  ${family} styles: ${list.length}`);
  }

  console.log('Validating against src/ …');
  validateAgainstSource(docDir, stylesFlat);
  console.log('Done.');
}

if (require.main === module) {
  main();
}
