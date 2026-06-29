import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const WEBSITE_BASE_URL = 'https://usestitch.ai';
const outputDir = join(rootDir, 'apps', 'website', 'dist');

const REGISTRY_FILES = ['/mcp-registry.json', '/embedding-models.json', '/stt-models.json'];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// --- Generic loading helpers ---

function loadProviderConfigs(modelsDir) {
  const files = readdirSync(modelsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(modelsDir, name));

  const providers = files.map((filePath) => {
    return readJson(filePath);
  });

  return providers.toSorted((a, b) => a.providerName.localeCompare(b.providerName));
}

// --- MCP server loading ---

function loadServerConfigs() {
  const serversDir = join(rootDir, 'registries', 'mcp', 'servers');
  const entries = readdirSync(serversDir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );

  const servers = entries.map((entry) => {
    const serverDir = join(serversDir, entry.name);
    const filePath = join(serverDir, 'config.json');
    const logoPath = join(serverDir, 'logo.svg');

    const parsed = readJson(filePath);

    if (!existsSync(logoPath)) return parsed;

    return {
      ...parsed,
      logoUrl: `${WEBSITE_BASE_URL}/mcp/servers/${parsed.id}/logo.svg`,
    };
  });

  return servers.toSorted((a, b) => a.name.localeCompare(b.name));
}

// --- Output writing ---

function writeRegistryJson(filePath, payload) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeHeaders() {
  const rules = REGISTRY_FILES.map(
    (path) => `${path}\n  Cache-Control: public, max-age=300, s-maxage=300`,
  );
  writeFileSync(join(outputDir, '_headers'), `${rules.join('\n\n')}\n`, 'utf8');
}

function copySchemas() {
  const schemasOutputDir = join(outputDir, 'schemas');
  mkdirSync(schemasOutputDir, { recursive: true });

  const schemaCopies = [
    {
      src: join(rootDir, 'registries', 'mcp', 'schema', 'mcp-server.schema.json'),
      dest: 'mcp-server.schema.json',
    },
    {
      src: join(rootDir, 'registries', 'embeddings', 'schema', 'embedding-provider.schema.json'),
      dest: 'embedding-provider.schema.json',
    },
    {
      src: join(rootDir, 'registries', 'stt', 'schema', 'stt-provider.schema.json'),
      dest: 'stt-provider.schema.json',
    },
  ];

  for (const { src, dest } of schemaCopies) {
    cpSync(src, join(schemasOutputDir, dest));
  }
}

function copyServerLogos(servers) {
  const serversDir = join(rootDir, 'registries', 'mcp', 'servers');
  for (const server of servers) {
    if (!server.logoUrl) continue;
    const logoInputPath = join(serversDir, server.id, 'logo.svg');
    const logoOutputDir = join(outputDir, 'mcp', 'servers', server.id);
    mkdirSync(logoOutputDir, { recursive: true });
    cpSync(logoInputPath, join(logoOutputDir, 'logo.svg'));
  }
}

function writeOutput(servers, embeddingProviders, sttProviders) {
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'mcp', 'servers'), { recursive: true });

  copySchemas();
  copyServerLogos(servers);
  writeHeaders();

  writeRegistryJson(join(outputDir, 'mcp-registry.json'), {
    version: 1,
    generatedAt: new Date().toISOString(),
    servers,
  });

  writeRegistryJson(join(outputDir, 'embedding-models.json'), {
    version: 1,
    generatedAt: new Date().toISOString(),
    providers: embeddingProviders,
  });

  writeRegistryJson(join(outputDir, 'stt-models.json'), {
    version: 1,
    generatedAt: new Date().toISOString(),
    providers: sttProviders,
  });
}

// --- Main ---

function main() {
  const servers = loadServerConfigs();
  const embeddingProviders = loadProviderConfigs(
    join(rootDir, 'registries', 'embeddings', 'models'),
  );
  const sttProviders = loadProviderConfigs(join(rootDir, 'registries', 'stt', 'models'));

  writeOutput(servers, embeddingProviders, sttProviders);

  console.log(
    `Built MCP registry with ${servers.length} server(s): ${join(outputDir, 'mcp-registry.json')}`,
  );
  console.log(
    `Built embedding registry with ${embeddingProviders.length} provider(s): ${join(outputDir, 'embedding-models.json')}`,
  );
  console.log(
    `Built STT registry with ${sttProviders.length} provider(s): ${join(outputDir, 'stt-models.json')}`,
  );
}

main();
