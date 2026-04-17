import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Args = {
  name: string;
  tableName: string;
};

function toPascalCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function toKebabCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toSnakeCase(value: string): string {
  return value.replace(/-/g, '_');
}

function getChecksum(version: number, name: string, tableName: string): string {
  const input = `${version}:${name}:${tableName}`;
  return `sha256:${createHash('sha256').update(input).digest('hex')}`;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {
    tableName: 'semantic_memories',
  };

  for (let i = 0; i < argv.length; i++) {
    const part = argv[i];
    if (part === '--name' && argv[i + 1]) {
      args.name = argv[i + 1];
      i++;
      continue;
    }

    if (part === '--table' && argv[i + 1]) {
      args.tableName = argv[i + 1];
      i++;
    }
  }

  if (!args.name) {
    throw new Error(
      'Usage: bun run lance:migration:new --name <migration-name> [--table <table-name>]',
    );
  }

  return args as Args;
}

function getConstName(versionTag: string, slug: string): string {
  return `migration${versionTag}${toPascalCase(slug)}`;
}

async function getLastMigrationId(migrationsDir: string): Promise<string | null> {
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => /^\d{4}-.+\.ts$/.test(file))
    .sort((a, b) => a.localeCompare(b));

  const last = files.at(-1);
  if (!last) return null;

  const content = await fs.readFile(path.join(migrationsDir, last), 'utf-8');
  const match = content.match(/\bid:\s*'([^']+)'/);
  if (!match) {
    throw new Error(`Failed to extract id from ${last}`);
  }

  return match[1] ?? null;
}

async function rewriteManifest(migrationsDir: string): Promise<void> {
  const allFiles = await fs.readdir(migrationsDir);
  const migrationFiles = allFiles
    .filter((file) => /^\d{4}-.+\.ts$/.test(file))
    .sort((a, b) => a.localeCompare(b));

  const imports = migrationFiles
    .map((file) => {
      const versionTag = file.slice(0, 4);
      const slug = file.slice(5, -3);
      const constName = getConstName(versionTag, slug);
      const importPath = file.slice(0, -3);
      return `import { ${constName} } from '@/db/lance-migrations/${importPath}.js';`;
    })
    .join('\n');

  const ordered = migrationFiles
    .map((file) => {
      const versionTag = file.slice(0, 4);
      const slug = file.slice(5, -3);
      return getConstName(versionTag, slug);
    })
    .join(', ');

  const manifest = `${imports}\nimport type { LanceMigrationDefinition } from '@/db/lance-migrations/types.js';\n\nexport const MIGRATIONS: LanceMigrationDefinition[] = [${ordered}];\n`;

  await fs.writeFile(path.join(migrationsDir, 'manifest.ts'), manifest, 'utf-8');
}

async function main() {
  const { name, tableName } = parseArgs(process.argv.slice(2));
  const slug = toKebabCase(name);
  const migrationName = toSnakeCase(slug);

  if (!slug) {
    throw new Error('Migration name must contain letters or numbers');
  }

  const migrationsDir = fileURLToPath(new URL('../src/db/lance-migrations', import.meta.url));
  const existingFiles = await fs.readdir(migrationsDir);
  const lastVersion = existingFiles
    .map((file) => {
      const match = file.match(/^(\d{4})-.+\.ts$/);
      return match ? Number(match[1]) : 0;
    })
    .reduce((max, value) => Math.max(max, value), 0);

  const version = lastVersion + 1;
  const versionTag = String(version).padStart(4, '0');
  const constName = getConstName(versionTag, slug);
  const id = randomUUID();
  const prevId = await getLastMigrationId(migrationsDir);
  const checksum = getChecksum(version, migrationName, tableName);
  const targetFile = path.join(migrationsDir, `${versionTag}-${slug}.ts`);

  const content = `import type { LanceMigrationDefinition } from '@/db/lance-migrations/types.js';\n\nexport const ${constName}: LanceMigrationDefinition = {\n  id: '${id}',\n  prevId: ${prevId ? `'${prevId}'` : 'null'},\n  version: ${version},\n  name: '${migrationName}',\n  checksum: '${checksum}',\n  tableName: '${tableName}',\n  up: async (_table) => {\n    throw new Error('Implement migration before running it');\n  },\n};\n`;

  await fs.writeFile(targetFile, content, 'utf-8');
  await rewriteManifest(migrationsDir);

  console.log(`Created ${path.basename(targetFile)}`);
  console.log(`- version: ${version}`);
  console.log(`- id: ${id}`);
  console.log(`- prevId: ${prevId ?? 'null'}`);
  console.log(`- name: ${migrationName}`);
  console.log(`- checksum: ${checksum}`);
}

await main();
