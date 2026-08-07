#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

import { SPACING_SCALE, VENDORED_UI_FILES } from '../tools/oxlint-plugins/ui/design-system.mjs';

const ROOT = join(import.meta.dir, '..');
const SOURCE_ROOT = join(ROOT, 'apps/web/src');
const updateBaseline = process.argv.includes('--update-drift-baseline');

function toPosix(path: string) {
  return path.replaceAll('\\', '/');
}

function listTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

function getVendoredUiFiles() {
  const missing = VENDORED_UI_FILES.filter((file) => !existsSync(join(ROOT, file)));
  if (missing.length > 0) throw new Error(`Missing vendored UI files:\n${missing.join('\n')}`);
  return VENDORED_UI_FILES;
}

const UTILITY = String.raw`[^\s"'\x60}]+`;
const typographyTokens =
  /^(?:text-(?:2xs|xs|sm|base|lg|xl|2xl|foreground|muted-foreground)|font-(?:normal|medium|semibold|bold|mono)|tracking-[^\s]+|leading-[^\s]+)$/;
const normalizedSpacing = new Map(
  SPACING_SCALE.flatMap(([legacy, utility]) => {
    const token = utility.replace('space-', '');
    return [
      [String(legacy), token],
      [token, token],
      [utility, token],
    ];
  }),
);

function matches(source: string, pattern: RegExp) {
  return new Set([...source.matchAll(pattern)].map((match) => match.at(1)));
}

function collectDrift(files: string[]) {
  const axes = {
    tokenOpacity: new Set<string>(),
    typography: new Set<string>(),
    iconSize: new Set<string>(),
    spacing: new Set<string>(),
    radius: new Set<string>(),
    motion: new Set<string>(),
  };
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const value of matches(
      source,
      new RegExp(String.raw`\b(?:bg|text|border|divide|ring|outline|shadow)-(${UTILITY}\/\d+)`, 'g'),
    ))
      axes.tokenOpacity.add(value);
    for (const value of matches(source, /\bsize-([\d.]+)\b/g)) axes.iconSize.add(value);
    for (const value of matches(
      source,
      new RegExp(String.raw`\b(?:[mp][trblxy]?|gap(?:-[xy])?|space-[xy])-(${UTILITY})`, 'g'),
    ))
      axes.spacing.add(normalizedSpacing.get(value) ?? value);
    for (const value of matches(source, new RegExp(String.raw`\b(rounded(?:-${UTILITY})?)`, 'g')))
      axes.radius.add(value);
    for (const value of matches(source, new RegExp(String.raw`\b((?:duration|ease)-${UTILITY})`, 'g')))
      axes.motion.add(value);
    for (const element of source.matchAll(/<(?:p|span)\b[^>]*>/gs)) {
      const tokens =
        element
          .at(0)
          .match(/[^\s"'`{}]+/g)
          ?.filter((token) => typographyTokens.test(token)) ?? [];
      if (tokens.length > 0) axes.typography.add([...new Set(tokens)].toSorted().join(' '));
    }
  }
  return Object.fromEntries(Object.entries(axes).map(([axis, values]) => [axis, values.size]));
}

const allFiles = listTsxFiles(SOURCE_ROOT);
const vendoredFiles = getVendoredUiFiles();
const vendoredFileSet = new Set(vendoredFiles);
const drift = {
  app: collectDrift(allFiles.filter((path) => !vendoredFileSet.has(toPosix(relative(ROOT, path))))),
  vendoredUi: collectDrift(allFiles.filter((path) => vendoredFileSet.has(toPosix(relative(ROOT, path))))),
};
const baselinePath = join(SOURCE_ROOT, 'styles/design-system-drift-baseline.json');
if (updateBaseline) {
  writeFileSync(baselinePath, `${JSON.stringify(drift, null, 2)}\n`);
} else {
  if (!existsSync(baselinePath)) {
    console.error(
      'Missing design-system drift baseline. Run: bun run scripts/check-design-system.ts --update-drift-baseline',
    );
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as typeof drift;
  const regressions = Object.entries(drift).flatMap(([scope, axes]) =>
    Object.entries(axes).flatMap(([axis, count]) => {
      const budget = baseline[scope as keyof typeof baseline][axis as keyof typeof axes];
      return count > budget ? [`${scope}.${axis}: ${count} > ${budget}`] : [];
    }),
  );
  if (regressions.length > 0) {
    console.error('Design-system drift budget exceeded:');
    for (const regression of regressions) console.error(`  ${regression}`);
    process.exit(1);
  }
}

console.log(`Design-system drift budget is current (${vendoredFiles.length} vendored UI files).`);
