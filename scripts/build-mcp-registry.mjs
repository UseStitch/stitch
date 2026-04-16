import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const registryDir = join(rootDir, 'registries', 'mcp');
const serversDir = join(registryDir, 'servers');
const schemaDir = join(registryDir, 'schema');
const outputDir = join(rootDir, 'apps', 'website', 'dist');
const outputFile = join(outputDir, 'mcp-registry.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertAuthConfig(authConfig, filePath) {
  assert(
    authConfig && typeof authConfig === 'object',
    `${filePath}: install.authConfig is required`,
  );
  assert(
    typeof authConfig.type === 'string',
    `${filePath}: install.authConfig.type must be a string`,
  );

  if (authConfig.type === 'none') {
    return;
  }

  if (authConfig.type === 'api_key') {
    assert(
      typeof authConfig.apiKey === 'string' && authConfig.apiKey.length > 0,
      `${filePath}: api_key auth requires apiKey`,
    );
    return;
  }

  if (authConfig.type === 'headers') {
    assert(
      authConfig.headers && typeof authConfig.headers === 'object',
      `${filePath}: headers auth requires headers object`,
    );
    for (const [header, value] of Object.entries(authConfig.headers)) {
      assert(
        typeof header === 'string' && header.length > 0,
        `${filePath}: header names must be non-empty strings`,
      );
      assert(typeof value === 'string', `${filePath}: header values must be strings`);
    }
    return;
  }

  throw new Error(`${filePath}: unsupported auth type ${String(authConfig.type)}`);
}

function assertServerConfig(server, filePath) {
  assert(server && typeof server === 'object', `${filePath}: config must be an object`);
  assert(typeof server.id === 'string' && server.id.length > 0, `${filePath}: id is required`);
  assert(
    typeof server.name === 'string' && server.name.length > 0,
    `${filePath}: name is required`,
  );
  assert(
    typeof server.description === 'string' && server.description.length > 0,
    `${filePath}: description is required`,
  );
  assert(
    typeof server.docsUrl === 'string' && server.docsUrl.length > 0,
    `${filePath}: docsUrl is required`,
  );
  assert(
    Array.isArray(server.tags) && server.tags.length > 0,
    `${filePath}: tags must be a non-empty array`,
  );

  const install = server.install;
  assert(install && typeof install === 'object', `${filePath}: install is required`);
  assert(
    typeof install.name === 'string' && install.name.length > 0,
    `${filePath}: install.name is required`,
  );
  assert(
    install.transport === 'http' || install.transport === 'stdio',
    `${filePath}: install.transport must be http or stdio`,
  );
  assert(
    typeof install.url === 'string' && install.url.length > 0,
    `${filePath}: install.url is required`,
  );
  assertAuthConfig(install.authConfig, filePath);

  if (install.optionalAuthConfigs !== undefined) {
    assert(
      Array.isArray(install.optionalAuthConfigs),
      `${filePath}: install.optionalAuthConfigs must be an array`,
    );
    for (const authConfig of install.optionalAuthConfigs) {
      assertAuthConfig(authConfig, filePath);
    }
  }
}

function loadServerConfigs() {
  const files = readdirSync(serversDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(serversDir, name));

  const servers = files.map((filePath) => {
    const parsed = readJson(filePath);
    assertServerConfig(parsed, filePath);
    return parsed;
  });

  const ids = new Set();
  for (const server of servers) {
    assert(!ids.has(server.id), `Duplicate server id: ${server.id}`);
    ids.add(server.id);
  }

  return servers.toSorted((a, b) => a.name.localeCompare(b.name));
}

function writeOutput(servers) {
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'schemas'), { recursive: true });

  cpSync(join(rootDir, 'apps', 'website', 'index.html'), join(outputDir, 'index.html'));
  cpSync(
    join(schemaDir, 'mcp-server.schema.json'),
    join(outputDir, 'schemas', 'mcp-server.schema.json'),
  );

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    servers,
  };

  writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const servers = loadServerConfigs();
  writeOutput(servers);
  console.log(`Built MCP registry with ${servers.length} server(s): ${outputFile}`);
}

main();
