import { docPageUrl } from './doc-markdown';
import { getVerifiedCommandNames, getVerifiedStyleSlugs } from './style-doc-links';
import { getCommands, getStyles } from './parser';

const STYLE_FAMILIES = [
  'fix',
  'compute',
  'collide',
  'react',
  'region',
  'surf_collide',
  'surf_react',
  'dump',
] as const;

/** URLs for prefetch/cache — only verified manual pages. */
export function getDocumentationPageUrls(docBaseUrl: string): string[] {
  const slugs = new Set<string>();

  for (const command of getVerifiedCommandNames()) {
    slugs.add(command);
  }

  for (const slug of Object.values(getVerifiedStyleSlugs())) {
    slugs.add(slug);
  }

  return [...slugs].sort().map((slug) => docPageUrl(docBaseUrl, slug));
}

/** All candidate documentation slugs from schema (includes unverified style pages). */
export function getAllSchemaDocumentationPageUrls(docBaseUrl: string): string[] {
  const slugs = new Set<string>();

  for (const command of getCommands()) {
    slugs.add(command);
  }

  for (const family of STYLE_FAMILIES) {
    for (const style of getStyles(family)) {
      const slug =
        family === 'fix' || family === 'compute'
          ? `${family}_${style.replace(/\//g, '_')}`
          : family === 'dump'
            ? `dump_${style}`
            : style;
      slugs.add(slug);
    }
  }

  return [...slugs].sort().map((slug) => docPageUrl(docBaseUrl, slug));
}
