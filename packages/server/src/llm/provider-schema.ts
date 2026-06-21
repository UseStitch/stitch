import { jsonSchema as toJsonSchema } from 'ai';

import type { ProviderId } from '@stitch/shared/providers/types';

import type { JSONSchema7, Schema, Tool } from 'ai';

const SCHEMA_SYMBOL = Symbol.for('vercel.ai.schema');

function isAiSchema(value: unknown): value is Schema {
  return (
    typeof value === 'object' &&
    value !== null &&
    SCHEMA_SYMBOL in value &&
    (value as Record<symbol, unknown>)[SCHEMA_SYMBOL] === true
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasCombiner(node: Record<string, unknown>): boolean {
  return Array.isArray(node.anyOf) || Array.isArray(node.oneOf) || Array.isArray(node.allOf);
}

/**
 * Recursively rewrites a JSON Schema so it satisfies Gemini's stricter
 * function-declaration validation. MCP servers frequently emit schemas that the
 * Google backend rejects, e.g. `required` arrays on nodes that are not typed as
 * `object` (often inside `anyOf`/`oneOf` array item branches), or integer enums.
 */
function sanitizeGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeGemini);
  if (!isPlainObject(node)) return node;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'enum' && Array.isArray(value)) {
      result[key] = value.map((entry) => String(entry));
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeGemini(value);
    } else {
      result[key] = value;
    }
  }

  if (Array.isArray(result.enum) && (result.type === 'integer' || result.type === 'number')) {
    result.type = 'string';
  }

  if (Array.isArray(result.type)) {
    const types = result.type;
    const nonNull = types.filter((entry) => entry !== 'null');
    if (nonNull.length === 0) {
      result.type = 'null';
    } else if (nonNull.length === 1) {
      result.type = nonNull[0];
      if (types.includes('null')) result.nullable = true;
    } else {
      delete result.type;
      result.anyOf = nonNull.map((entry) => ({ type: entry }));
      if (types.includes('null')) result.nullable = true;
    }
  }

  if (result.type !== 'object' && !hasCombiner(result)) {
    delete result.required;
    delete result.properties;
  } else if (result.type === 'object' && Array.isArray(result.required)) {
    const properties = isPlainObject(result.properties) ? result.properties : {};
    result.required = result.required.filter((field) => field in properties);
  }

  // Array schemas must declare `items`; default empty item schemas to string.
  if (result.type === 'array' && !hasCombiner(result)) {
    if (result.items === undefined || result.items === null) result.items = { type: 'string' };
  }

  return result;
}

const JSON_SCHEMA_TYPES = [
  'string',
  'number',
  'boolean',
  'integer',
  'object',
  'array',
  'null',
] as const;
const COMBINER_KEYS = ['anyOf', 'oneOf', 'allOf'] as const;

/**
 * Lowers a JSON Schema into the dialect OpenAI's tool-calling backend accepts.
 * Mirrors Codex's Rust schema compatibility pass: JSON Schema boolean forms are
 * unsupported, `const` becomes a single-value `enum`, and nodes that omit `type`
 * (common in MCP-authored schemas) get an inferred type so they stay usable
 * after unsupported keywords are dropped.
 */
function sanitizeOpenAI(value: unknown): unknown {
  if (typeof value === 'boolean') return { type: 'string' };
  if (Array.isArray(value)) return value.map(sanitizeOpenAI);
  if (!isPlainObject(value)) return value;

  const result: Record<string, unknown> = {};

  if (typeof value.$ref === 'string') result.$ref = value.$ref;
  if (typeof value.description === 'string') result.description = value.description;
  if ('const' in value) result.enum = [value.const];
  else if (Array.isArray(value.enum)) result.enum = value.enum;

  if (isPlainObject(value.properties)) {
    result.properties = Object.fromEntries(
      Object.entries(value.properties).map(([key, item]) => [key, sanitizeOpenAI(item)]),
    );
  }

  if (Array.isArray(value.required)) {
    result.required = value.required.filter((item) => typeof item === 'string');
  }

  if ('items' in value) result.items = sanitizeOpenAI(value.items);

  if ('additionalProperties' in value) {
    result.additionalProperties =
      typeof value.additionalProperties === 'boolean'
        ? value.additionalProperties
        : sanitizeOpenAI(value.additionalProperties);
  }

  for (const key of COMBINER_KEYS) {
    if (Array.isArray(value[key])) result[key] = value[key].map(sanitizeOpenAI);
  }

  for (const key of ['$defs', 'definitions']) {
    if (isPlainObject(value[key])) {
      result[key] = Object.fromEntries(
        Object.entries(value[key]).map(([name, item]) => [name, sanitizeOpenAI(item)]),
      );
    }
  }

  const isType = (entry: unknown): entry is string =>
    typeof entry === 'string' && (JSON_SCHEMA_TYPES as readonly string[]).includes(entry);
  const schemaTypes =
    typeof value.type === 'string'
      ? isType(value.type)
        ? [value.type]
        : []
      : Array.isArray(value.type)
        ? value.type.filter(isType)
        : [];

  if (
    schemaTypes.length === 0 &&
    (typeof result.$ref === 'string' || COMBINER_KEYS.some((key) => key in result))
  ) {
    return result;
  }

  const inferType = (): string[] => {
    if (schemaTypes.length > 0) return schemaTypes;
    if (['properties', 'required', 'additionalProperties'].some((key) => key in value)) {
      return ['object'];
    }
    if (['items', 'prefixItems'].some((key) => key in value)) return ['array'];
    if ('enum' in result || 'format' in value) return ['string'];
    if (
      ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'].some(
        (key) => key in value,
      )
    ) {
      return ['number'];
    }
    return [];
  };

  const inferredTypes = inferType();
  if (inferredTypes.length === 0) return {};

  result.type = inferredTypes.length === 1 ? inferredTypes[0] : inferredTypes;
  if (inferredTypes.includes('object') && !('properties' in result)) result.properties = {};
  if (inferredTypes.includes('array') && !('items' in result)) result.items = { type: 'string' };
  return result;
}

type SchemaSanitizer = (schema: unknown) => unknown;

function modelIsGemini(modelId: string): boolean {
  return modelId.toLowerCase().includes('gemini');
}

/**
 * Selects the JSON Schema sanitizer required by the target backend, or `null`
 * when the provider/model needs no rewriting. OpenAI-compatible transports
 * (nvidia, ollama, gateways) can proxy to Gemini, so the Gemini pass is also
 * selected whenever the model id looks like a Gemini model.
 */
function selectSanitizer(providerId: ProviderId, modelId: string): SchemaSanitizer | null {
  if (providerId === 'google') return sanitizeGemini;
  if (providerId === 'google-vertex') return modelIsGemini(modelId) ? sanitizeGemini : null;
  if (providerId === 'openai') return sanitizeOpenAI;
  if (
    providerId === 'nvidia' ||
    providerId === 'ollama_local' ||
    providerId === 'openrouter' ||
    providerId === 'vercel'
  ) {
    return modelIsGemini(modelId) ? sanitizeGemini : sanitizeOpenAI;
  }
  return null;
}

function sanitizeTool(tool: Tool, sanitize: SchemaSanitizer): Tool {
  const schema = (tool as { inputSchema?: unknown }).inputSchema;
  if (!isAiSchema(schema)) return tool;

  const raw = schema.jsonSchema;
  if (!isPlainObject(raw)) return tool;

  const sanitized = sanitize(raw) as JSONSchema7;
  return {
    ...tool,
    inputSchema: toJsonSchema(sanitized, { validate: schema.validate }),
  } as Tool;
}

export function sanitizeToolSchemasForProvider(
  tools: Record<string, Tool>,
  providerId: ProviderId,
  modelId: string,
): Record<string, Tool> {
  const sanitize = selectSanitizer(providerId, modelId);
  if (!sanitize) return tools;

  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [name, sanitizeTool(tool, sanitize)]),
  );
}
