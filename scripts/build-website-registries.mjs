import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const registryDir = join(rootDir, 'registries', 'mcp');
const serversDir = join(registryDir, 'servers');
const schemaDir = join(registryDir, 'schema');
const embeddingsRegistryDir = join(rootDir, 'registries', 'embeddings');
const embeddingModelsDir = join(embeddingsRegistryDir, 'models');
const embeddingSchemaDir = join(embeddingsRegistryDir, 'schema');
const liveTranscriptionRegistryDir = join(rootDir, 'registries', 'live-transcription');
const liveTranscriptionModelsDir = join(liveTranscriptionRegistryDir, 'models');
const liveTranscriptionSchemaDir = join(liveTranscriptionRegistryDir, 'schema');
const outputDir = join(rootDir, 'apps', 'website', 'dist');
const outputFile = join(outputDir, 'mcp-registry.json');
const embeddingOutputFile = join(outputDir, 'embedding-models.json');
const liveTranscriptionOutputFile = join(outputDir, 'live-transcription-models.json');

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

function assertEmbeddingModel(model, filePath) {
  assert(model && typeof model === 'object', `${filePath}: model must be an object`);
  assert(typeof model.id === 'string' && model.id.length > 0, `${filePath}: model.id is required`);
  assert(
    typeof model.name === 'string' && model.name.length > 0,
    `${filePath}: model.name is required`,
  );
  assert(
    Number.isInteger(model.dimensions) && model.dimensions > 0,
    `${filePath}: model.dimensions must be a positive integer`,
  );
  assert(
    typeof model.release_date === 'string' && model.release_date.length > 0,
    `${filePath}: model.release_date is required`,
  );
  assert(
    Number.isInteger(model.context) && model.context > 0,
    `${filePath}: model.context must be a positive integer`,
  );
  if (model.inputModalities !== undefined) {
    assert(
      Array.isArray(model.inputModalities) && model.inputModalities.length > 0,
      `${filePath}: model.inputModalities must be a non-empty array`,
    );
  }
  if (model.outputModalities !== undefined) {
    assert(
      Array.isArray(model.outputModalities) && model.outputModalities.length > 0,
      `${filePath}: model.outputModalities must be a non-empty array`,
    );
  }
  assert(model.cost && typeof model.cost === 'object', `${filePath}: model.cost is required`);
  assert(typeof model.cost.input === 'number', `${filePath}: model.cost.input must be a number`);
  if (model.cost.inputImage !== undefined) {
    assert(
      typeof model.cost.inputImage === 'number',
      `${filePath}: model.cost.inputImage must be a number`,
    );
  }
  if (model.cost.inputAudio !== undefined) {
    assert(
      typeof model.cost.inputAudio === 'number',
      `${filePath}: model.cost.inputAudio must be a number`,
    );
  }
  if (model.cost.inputVideo !== undefined) {
    assert(
      typeof model.cost.inputVideo === 'number',
      `${filePath}: model.cost.inputVideo must be a number`,
    );
  }
  assert(typeof model.cost.output === 'number', `${filePath}: model.cost.output must be a number`);
}

function assertEmbeddingProviderConfig(provider, filePath) {
  assert(provider && typeof provider === 'object', `${filePath}: config must be an object`);
  assert(
    provider.providerId === 'google' || provider.providerId === 'openai',
    `${filePath}: providerId must be google or openai`,
  );
  assert(
    typeof provider.providerName === 'string' && provider.providerName.length > 0,
    `${filePath}: providerName is required`,
  );
  assert(
    Array.isArray(provider.models) && provider.models.length > 0,
    `${filePath}: models must be a non-empty array`,
  );

  const ids = new Set();
  for (const model of provider.models) {
    assertEmbeddingModel(model, filePath);
    assert(!ids.has(model.id), `${filePath}: duplicate model id ${model.id}`);
    ids.add(model.id);
  }
}

function assertLiveTranscriptionModel(model, filePath) {
  assert(model && typeof model === 'object', `${filePath}: model must be an object`);
  assert(typeof model.id === 'string' && model.id.length > 0, `${filePath}: model.id is required`);
  assert(
    typeof model.name === 'string' && model.name.length > 0,
    `${filePath}: model.name is required`,
  );
  assert(
    typeof model.endpoint === 'string' && model.endpoint.startsWith('wss://'),
    `${filePath}: model.endpoint must be a wss:// URL`,
  );
  assert(model.audio && typeof model.audio === 'object', `${filePath}: model.audio is required`);
  assert(
    Number.isInteger(model.audio.sampleRate) && model.audio.sampleRate >= 8000,
    `${filePath}: model.audio.sampleRate must be an integer >= 8000`,
  );
  assert(
    Number.isInteger(model.audio.channels) && model.audio.channels >= 1,
    `${filePath}: model.audio.channels must be a positive integer`,
  );
  assert(
    model.audio.encoding === 'pcm_s16le',
    `${filePath}: model.audio.encoding must be pcm_s16le`,
  );
  assert(
    model.connection && typeof model.connection === 'object',
    `${filePath}: model.connection is required`,
  );
  assert(
    model.connection.mode === 'per-source' || model.connection.mode === 'single',
    `${filePath}: model.connection.mode must be per-source or single`,
  );
  assert(
    model.connection.authMethod === 'query-param' || model.connection.authMethod === 'header',
    `${filePath}: model.connection.authMethod must be query-param or header`,
  );
  if (model.supportedLanguages !== undefined) {
    assert(
      Array.isArray(model.supportedLanguages) && model.supportedLanguages.length > 0,
      `${filePath}: model.supportedLanguages must be a non-empty array`,
    );
  }
}

function assertLiveTranscriptionProviderConfig(provider, filePath) {
  assert(provider && typeof provider === 'object', `${filePath}: config must be an object`);
  assert(
    provider.providerId === 'google' || provider.providerId === 'openai',
    `${filePath}: providerId must be google or openai`,
  );
  assert(
    typeof provider.providerName === 'string' && provider.providerName.length > 0,
    `${filePath}: providerName is required`,
  );
  assert(
    Array.isArray(provider.models) && provider.models.length > 0,
    `${filePath}: models must be a non-empty array`,
  );

  const ids = new Set();
  for (const model of provider.models) {
    assertLiveTranscriptionModel(model, filePath);
    assert(!ids.has(model.id), `${filePath}: duplicate model id ${model.id}`);
    ids.add(model.id);
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

function loadEmbeddingProviderConfigs() {
  const files = readdirSync(embeddingModelsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(embeddingModelsDir, name));

  const providers = files.map((filePath) => {
    const parsed = readJson(filePath);
    assertEmbeddingProviderConfig(parsed, filePath);
    return parsed;
  });

  const ids = new Set();
  for (const provider of providers) {
    assert(
      !ids.has(provider.providerId),
      `Duplicate embedding provider id: ${provider.providerId}`,
    );
    ids.add(provider.providerId);
  }

  return providers.toSorted((a, b) => a.providerName.localeCompare(b.providerName));
}

function loadLiveTranscriptionProviderConfigs() {
  const files = readdirSync(liveTranscriptionModelsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(liveTranscriptionModelsDir, name));

  const providers = files.map((filePath) => {
    const parsed = readJson(filePath);
    assertLiveTranscriptionProviderConfig(parsed, filePath);
    return parsed;
  });

  const ids = new Set();
  for (const provider of providers) {
    assert(
      !ids.has(provider.providerId),
      `Duplicate live transcription provider id: ${provider.providerId}`,
    );
    ids.add(provider.providerId);
  }

  return providers.toSorted((a, b) => a.providerName.localeCompare(b.providerName));
}

function writeOutput(servers, embeddingProviders, liveTranscriptionProviders) {
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'schemas'), { recursive: true });

  cpSync(join(rootDir, 'apps', 'website', 'index.html'), join(outputDir, 'index.html'));
  cpSync(
    join(schemaDir, 'mcp-server.schema.json'),
    join(outputDir, 'schemas', 'mcp-server.schema.json'),
  );
  cpSync(
    join(embeddingSchemaDir, 'embedding-provider.schema.json'),
    join(outputDir, 'schemas', 'embedding-provider.schema.json'),
  );
  cpSync(
    join(liveTranscriptionSchemaDir, 'live-transcription-provider.schema.json'),
    join(outputDir, 'schemas', 'live-transcription-provider.schema.json'),
  );

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    servers,
  };

  writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const embeddingPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    providers: embeddingProviders,
  };

  writeFileSync(embeddingOutputFile, `${JSON.stringify(embeddingPayload, null, 2)}\n`, 'utf8');

  const liveTranscriptionPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    providers: liveTranscriptionProviders,
  };

  writeFileSync(
    liveTranscriptionOutputFile,
    `${JSON.stringify(liveTranscriptionPayload, null, 2)}\n`,
    'utf8',
  );
}

function main() {
  const servers = loadServerConfigs();
  const embeddingProviders = loadEmbeddingProviderConfigs();
  const liveTranscriptionProviders = loadLiveTranscriptionProviderConfigs();
  writeOutput(servers, embeddingProviders, liveTranscriptionProviders);
  console.log(`Built MCP registry with ${servers.length} server(s): ${outputFile}`);
  console.log(
    `Built embedding registry with ${embeddingProviders.length} provider(s): ${embeddingOutputFile}`,
  );
  console.log(
    `Built live transcription registry with ${liveTranscriptionProviders.length} provider(s): ${liveTranscriptionOutputFile}`,
  );
}

main();
