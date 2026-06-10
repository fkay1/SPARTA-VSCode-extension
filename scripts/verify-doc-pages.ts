#!/usr/bin/env npx tsx
/**
 * Verify which SPARTA manual HTML pages exist and write verified-doc-pages.json.
 *
 * Usage: npm run verify-doc-pages
 */

import * as fs from 'fs';
import * as path from 'path';
import commands from '../server/src/schema/commands.json';
import stylesFull from '../server/src/schema/styles-full.json';
import { docPageUrl } from '../server/src/doc-markdown';

const DOC_BASE = process.env.SPARTA_DOC_BASE ?? 'https://sparta.github.io/doc';
const OUT_FILE = path.resolve(__dirname, '../server/src/schema/verified-doc-pages.json');
const CONCURRENCY = 8;

interface StyleEntry {
  family: string;
  style: string;
  docFile?: string;
}

interface VerifiedDocPages {
  baseUrl: string;
  verifiedAt: string;
  commands: string[];
  styles: Record<string, string>;
}

async function pageExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (response.status === 405) {
      const getResponse = await fetch(url, { method: 'GET', redirect: 'follow' });
      return getResponse.ok;
    }
    return response.ok;
  } catch {
    return false;
  }
}

function slugFromDocFile(docFile: string): string {
  return docFile.replace(/\.txt$/i, '');
}

async function verifySlugs(
  entries: Array<{ key: string; slug: string }>
): Promise<Map<string, string>> {
  const verified = new Map<string, string>();
  let index = 0;

  const worker = async (): Promise<void> => {
    while (index < entries.length) {
      const entry = entries[index++];
      const url = docPageUrl(DOC_BASE, entry.slug);
      if (await pageExists(url)) {
        verified.set(entry.key, entry.slug);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, entries.length || 1) }, worker)
  );
  return verified;
}

async function main(): Promise<void> {
  const commandEntries = (commands as string[]).map((command) => ({
    key: command,
    slug: command,
  }));

  const styleEntries: Array<{ key: string; slug: string }> = [];
  for (const [family, entries] of Object.entries(
    stylesFull as Record<string, StyleEntry[]>
  )) {
    for (const entry of entries) {
      if (!entry.docFile) {
        continue;
      }
      styleEntries.push({
        key: entry.style,
        slug: slugFromDocFile(entry.docFile),
      });
    }
    void family;
  }

  console.log(`Checking ${commandEntries.length} commands and ${styleEntries.length} style pages...`);

  const [verifiedCommands, verifiedStyles] = await Promise.all([
    verifySlugs(commandEntries),
    verifySlugs(styleEntries),
  ]);

  const output: VerifiedDocPages = {
    baseUrl: DOC_BASE,
    verifiedAt: new Date().toISOString(),
    commands: [...verifiedCommands.keys()].sort(),
    styles: Object.fromEntries([...verifiedStyles.entries()].sort()),
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + '\n');

  console.log(`Verified ${output.commands.length} command pages.`);
  console.log(`Verified ${Object.keys(output.styles).length} style pages.`);
  console.log(`Wrote ${OUT_FILE}`);
}

void main();
