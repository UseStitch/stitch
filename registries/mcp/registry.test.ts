import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

type JsonSchema = Parameters<typeof z.fromJSONSchema>[0];

type McpServer = { id: string };

const registryDir = import.meta.dir;
const serversDir = join(registryDir, 'servers');
const schema = z.fromJSONSchema(
  readJson(join(registryDir, 'schema', 'mcp-server.schema.json')) as JsonSchema,
) as z.ZodType<McpServer>;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function expectValidRegistryEntry(path: string) {
  const result = schema.safeParse(readJson(path));
  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data;
}

function serverEntries() {
  return readdirSync(serversDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, configPath: join(serversDir, entry.name, 'config.json') }));
}

describe('MCP registry', () => {
  test('server configs match the schema', () => {
    for (const entry of serverEntries()) {
      expectValidRegistryEntry(entry.configPath);
    }
  });

  test('server ids match directory names and are unique', () => {
    const ids = new Set<string>();

    for (const entry of serverEntries()) {
      const server = expectValidRegistryEntry(entry.configPath);

      expect(server.id).toBe(entry.name);
      expect(ids.has(server.id), `Duplicate server id: ${server.id}`).toBe(false);
      ids.add(server.id);
    }
  });
});
