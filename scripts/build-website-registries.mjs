import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const WEBSITE_BASE_URL = 'https://usestitch.ai';
const outputDir = join(rootDir, 'apps', 'website', 'dist');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// --- Validation helpers ---

function assertNonEmptyString(value, filePath, field) {
  assert(typeof value === 'string' && value.length > 0, `${filePath}: ${field} is required`);
}

function assertObject(value, filePath, field) {
  assert(value && typeof value === 'object', `${filePath}: ${field} is required`);
}

function assertPositiveInt(value, filePath, field) {
  assert(Number.isInteger(value) && value > 0, `${filePath}: ${field} must be a positive integer`);
}

function assertNonEmptyArray(value, filePath, field) {
  assert(
    Array.isArray(value) && value.length > 0,
    `${filePath}: ${field} must be a non-empty array`,
  );
}

function assertOneOf(value, allowed, filePath, field) {
  assert(allowed.includes(value), `${filePath}: ${field} must be ${allowed.join(' or ')}`);
}

function assertOptionalNonEmptyArray(value, filePath, field) {
  if (value === undefined) return;
  assertNonEmptyArray(value, filePath, field);
}

function assertOptionalNumber(value, filePath, field) {
  if (value === undefined) return;
  assert(typeof value === 'number', `${filePath}: ${field} must be a number`);
}

// --- Auth config validation ---

function assertAuthConfig(authConfig, filePath) {
  assertObject(authConfig, filePath, 'install.authConfig');
  assert(
    typeof authConfig.type === 'string',
    `${filePath}: install.authConfig.type must be a string`,
  );

  if (authConfig.type === 'none') return;

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

// --- MCP server validation ---

function assertServerConfig(server, filePath) {
  assertObject(server, filePath, 'config');
  assertNonEmptyString(server.id, filePath, 'id');
  assertNonEmptyString(server.name, filePath, 'name');
  assertNonEmptyString(server.description, filePath, 'description');
  assertNonEmptyString(server.docsUrl, filePath, 'docsUrl');

  if (server.logoUrl !== undefined) {
    assertNonEmptyString(server.logoUrl, filePath, 'logoUrl');
  }

  assertNonEmptyArray(server.tags, filePath, 'tags');

  const install = server.install;
  assertObject(install, filePath, 'install');
  assertNonEmptyString(install.name, filePath, 'install.name');
  assertOneOf(install.transport, ['http', 'stdio'], filePath, 'install.transport');
  assertNonEmptyString(install.url, filePath, 'install.url');
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

// --- Embedding model validation ---

function assertEmbeddingModel(model, filePath) {
  assertObject(model, filePath, 'model');
  assertNonEmptyString(model.id, filePath, 'model.id');
  assertNonEmptyString(model.name, filePath, 'model.name');
  assertPositiveInt(model.dimensions, filePath, 'model.dimensions');
  assertNonEmptyString(model.release_date, filePath, 'model.release_date');
  assertPositiveInt(model.context, filePath, 'model.context');
  assertOptionalNonEmptyArray(model.inputModalities, filePath, 'model.inputModalities');
  assertOptionalNonEmptyArray(model.outputModalities, filePath, 'model.outputModalities');
  assertObject(model.cost, filePath, 'model.cost');
  assert(typeof model.cost.input === 'number', `${filePath}: model.cost.input must be a number`);
  assertOptionalNumber(model.cost.inputImage, filePath, 'model.cost.inputImage');
  assertOptionalNumber(model.cost.inputAudio, filePath, 'model.cost.inputAudio');
  assertOptionalNumber(model.cost.inputVideo, filePath, 'model.cost.inputVideo');
  assert(typeof model.cost.output === 'number', `${filePath}: model.cost.output must be a number`);
}

function assertEmbeddingProviderConfig(provider, filePath) {
  assertObject(provider, filePath, 'config');
  assertOneOf(provider.providerId, ['google', 'openai'], filePath, 'providerId');
  assertNonEmptyString(provider.providerName, filePath, 'providerName');
  assertNonEmptyArray(provider.models, filePath, 'models');
  assertUniqueIds(provider.models, (m) => m.id, filePath);
  for (const model of provider.models) {
    assertEmbeddingModel(model, filePath);
  }
}

// --- STT model validation ---

function assertSttModel(model, filePath) {
  assertObject(model, filePath, 'model');
  assertNonEmptyString(model.modelId, filePath, 'model.modelId');
  assertNonEmptyString(model.displayName, filePath, 'model.displayName');
  assertObject(model.capabilities, filePath, 'model.capabilities');
  assertObject(model.inputFormat, filePath, 'model.inputFormat');
  assertOneOf(
    model.inputFormat.encoding,
    ['pcm_s16le', 'f32le'],
    filePath,
    'model.inputFormat.encoding',
  );
  assert(
    Number.isInteger(model.inputFormat.sampleRateHz) && model.inputFormat.sampleRateHz >= 8000,
    `${filePath}: model.inputFormat.sampleRateHz must be an integer >= 8000`,
  );
  assertPositiveInt(model.inputFormat.channels, filePath, 'model.inputFormat.channels');
  assertOneOf(
    model.partialStrategy,
    ['cumulative', 'incremental'],
    filePath,
    'model.partialStrategy',
  );
  assertObject(model.buffer, filePath, 'model.buffer');
  assertObject(model.reconnect, filePath, 'model.reconnect');
  assertObject(model.pricing, filePath, 'model.pricing');
  assertOneOf(model.pricing.type, ['token', 'duration'], filePath, 'model.pricing.type');
}

function assertSttProviderConfig(provider, filePath) {
  assertObject(provider, filePath, 'config');
  assertNonEmptyString(provider.providerId, filePath, 'providerId');
  assertNonEmptyString(provider.providerName, filePath, 'providerName');
  assertNonEmptyArray(provider.models, filePath, 'models');
  assertUniqueIds(provider.models, (m) => m.modelId, filePath);
  for (const model of provider.models) {
    assertSttModel(model, filePath);
  }
}

// --- Generic loading helpers ---

function assertUniqueIds(items, getId, filePath) {
  const ids = new Set();
  for (const item of items) {
    const id = getId(item);
    assert(!ids.has(id), `${filePath}: duplicate model id ${id}`);
    ids.add(id);
  }
}

function assertUniqueProviderIds(providers, label) {
  const ids = new Set();
  for (const provider of providers) {
    assert(!ids.has(provider.providerId), `Duplicate ${label} provider id: ${provider.providerId}`);
    ids.add(provider.providerId);
  }
}

function loadProviderConfigs(modelsDir, validator, label) {
  const files = readdirSync(modelsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(modelsDir, name));

  const providers = files.map((filePath) => {
    const parsed = readJson(filePath);
    validator(parsed, filePath);
    return parsed;
  });

  assertUniqueProviderIds(providers, label);
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

    assert(existsSync(filePath), `${serverDir}: config.json is required`);
    const parsed = readJson(filePath);
    assertServerConfig(parsed, filePath);
    assert(parsed.id === entry.name, `${filePath}: id must match directory name ${entry.name}`);

    if (!existsSync(logoPath)) return parsed;

    return {
      ...parsed,
      logoUrl: `${WEBSITE_BASE_URL}/mcp/servers/${parsed.id}/logo.svg`,
    };
  });

  const ids = new Set();
  for (const server of servers) {
    assert(!ids.has(server.id), `Duplicate server id: ${server.id}`);
    ids.add(server.id);
  }

  return servers.toSorted((a, b) => a.name.localeCompare(b.name));
}

// --- Output writing ---

function writeRegistryJson(filePath, payload) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
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
    assertEmbeddingProviderConfig,
    'embedding',
  );
  const sttProviders = loadProviderConfigs(
    join(rootDir, 'registries', 'stt', 'models'),
    assertSttProviderConfig,
    'STT',
  );

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
