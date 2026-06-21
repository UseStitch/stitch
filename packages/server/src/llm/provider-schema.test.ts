import { describe, expect, test } from 'bun:test';
import { jsonSchema as toJsonSchema, dynamicTool } from 'ai';

import type { ProviderId } from '@stitch/shared/providers/types';

import { sanitizeToolSchemasForProvider } from '@/llm/provider-schema.js';

import type { JSONSchema7, Schema, Tool } from 'ai';

function mcpTool(schema: JSONSchema7): Tool {
  return dynamicTool({
    description: 'test',
    inputSchema: toJsonSchema(schema),
    execute: async () => ({}),
  }) as Tool;
}

function resolvedSchema(tool: Tool): JSONSchema7 {
  return (tool as { inputSchema: Schema }).inputSchema.jsonSchema as JSONSchema7;
}

describe('sanitizeToolSchemasForProvider', () => {
  test('strips required from non-object anyOf branches for google (Apollo repro)', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        tasks_attributes: {
          type: 'array',
          items: {
            anyOf: [
              { required: ['id'] },
              { required: ['name'] },
            ],
          } as JSONSchema7,
        },
      },
    };

    const out = sanitizeToolSchemasForProvider(
      { t: mcpTool(schema) },
      'google' as ProviderId,
      'gemini-3.5-flash',
    );

    const items = (resolvedSchema(out.t).properties!.tasks_attributes as JSONSchema7)
      .items as JSONSchema7;
    const branches = items.anyOf as JSONSchema7[];
    expect(branches[0].required).toBeUndefined();
    expect(branches[1].required).toBeUndefined();
  });

  test('removes properties/required from typed non-object nodes', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        name: { type: 'string', required: ['x'], properties: { x: {} } } as JSONSchema7,
      },
    };

    const out = sanitizeToolSchemasForProvider(
      { t: mcpTool(schema) },
      'google' as ProviderId,
      'gemini-3.5-flash',
    );

    const name = resolvedSchema(out.t).properties!.name as JSONSchema7;
    expect(name.required).toBeUndefined();
    expect(name.properties).toBeUndefined();
  });

  test('filters object required to existing properties only', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a', 'missing'],
    };

    const out = sanitizeToolSchemasForProvider(
      { t: mcpTool(schema) },
      'google' as ProviderId,
      'gemini-3.5-flash',
    );

    expect(resolvedSchema(out.t).required).toEqual(['a']);
  });

  test('converts integer/number enums to string enums', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        level: { type: 'integer', enum: [1, 2, 3] },
      },
    };

    const out = sanitizeToolSchemasForProvider(
      { t: mcpTool(schema) },
      'google' as ProviderId,
      'gemini-3.5-flash',
    );

    const level = resolvedSchema(out.t).properties!.level as JSONSchema7;
    expect(level.type).toBe('string');
    expect(level.enum).toEqual(['1', '2', '3']);
  });

  test('splits multi-type arrays into anyOf and lifts null to nullable', () => {
    const schema = {
      type: 'object',
      properties: {
        value: { type: ['string', 'number', 'null'] },
      },
    } as unknown as JSONSchema7;

    const out = sanitizeToolSchemasForProvider(
      { t: mcpTool(schema) },
      'google' as ProviderId,
      'gemini-3.5-flash',
    );

    const value = resolvedSchema(out.t).properties!.value as Record<string, unknown>;
    expect(value.type).toBeUndefined();
    expect(value.anyOf).toEqual([{ type: 'string' }, { type: 'number' }]);
    expect(value.nullable).toBe(true);
  });

  test('defaults missing array items to string', () => {
    const schema = { type: 'object', properties: { tags: { type: 'array' } } } as JSONSchema7;

    const out = sanitizeToolSchemasForProvider(
      { t: mcpTool(schema) },
      'google' as ProviderId,
      'gemini-3.5-flash',
    );

    const tags = resolvedSchema(out.t).properties!.tags as JSONSchema7;
    expect(tags.items).toEqual({ type: 'string' });
  });

  test('passes tools through unchanged for providers needing no sanitization', () => {
    const tools = { t: mcpTool({ type: 'object', properties: {} }) };
    const out = sanitizeToolSchemasForProvider(tools, 'anthropic' as ProviderId, 'claude');
    expect(out).toBe(tools);
  });

  test('only sanitizes gemini models on google-vertex', () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: { p: { type: 'string', required: ['x'] } as JSONSchema7 },
    };

    const claudeTools = { t: mcpTool(schema) };
    const claudeOut = sanitizeToolSchemasForProvider(
      claudeTools,
      'google-vertex' as ProviderId,
      'claude-3-7-sonnet',
    );
    expect(claudeOut).toBe(claudeTools);

    const geminiOut = sanitizeToolSchemasForProvider(
      { t: mcpTool(schema) },
      'google-vertex' as ProviderId,
      'gemini-2.5-pro',
    );
    expect((resolvedSchema(geminiOut.t).properties!.p as JSONSchema7).required).toBeUndefined();
  });

  describe('openai sanitizer', () => {
    test('replaces const with single-value enum and infers object type', () => {
      const schema = {
        properties: { mode: { const: 'fast' } },
      } as unknown as JSONSchema7;

      const out = sanitizeToolSchemasForProvider(
        { t: mcpTool(schema) },
        'openai' as ProviderId,
        'gpt-4o',
      );

      const root = resolvedSchema(out.t);
      expect(root.type).toBe('object');
      const mode = root.properties!.mode as JSONSchema7;
      expect(mode).toEqual({ enum: ['fast'], type: 'string' });
    });

    test('lowers boolean schema nodes to string type', () => {
      const schema = {
        type: 'object',
        properties: { anything: true },
      } as unknown as JSONSchema7;

      const out = sanitizeToolSchemasForProvider(
        { t: mcpTool(schema) },
        'openai' as ProviderId,
        'gpt-4o',
      );

      expect(resolvedSchema(out.t).properties!.anything).toEqual({ type: 'string' });
    });

    test('infers array type and defaults missing items to string', () => {
      const schema = {
        type: 'object',
        properties: { tags: { items: {} } },
      } as unknown as JSONSchema7;

      const out = sanitizeToolSchemasForProvider(
        { t: mcpTool(schema) },
        'openai' as ProviderId,
        'gpt-4o',
      );

      const tags = resolvedSchema(out.t).properties!.tags as JSONSchema7;
      expect(tags.type).toBe('array');
    });

    test('keeps combiner-only nodes without forcing a type', () => {
      const schema = {
        type: 'object',
        properties: {
          value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        },
      } as JSONSchema7;

      const out = sanitizeToolSchemasForProvider(
        { t: mcpTool(schema) },
        'openai' as ProviderId,
        'gpt-4o',
      );

      const value = resolvedSchema(out.t).properties!.value as JSONSchema7;
      expect(value.type).toBeUndefined();
      expect(value.anyOf).toEqual([{ type: 'string' }, { type: 'number' }]);
    });
  });

  describe('openai-compatible proxy gating', () => {
    test('applies gemini sanitizer for gemini models on a gateway provider', () => {
      const schema: JSONSchema7 = {
        type: 'object',
        properties: { level: { type: 'integer', enum: [1, 2] } },
      };

      const out = sanitizeToolSchemasForProvider(
        { t: mcpTool(schema) },
        'vercel' as ProviderId,
        'google/gemini-2.5-pro',
      );

      const level = resolvedSchema(out.t).properties!.level as JSONSchema7;
      expect(level.type).toBe('string');
      expect(level.enum).toEqual(['1', '2']);
    });

    test('applies openai sanitizer for non-gemini models on a gateway provider', () => {
      const schema = {
        type: 'object',
        properties: { mode: { const: 'x' } },
      } as unknown as JSONSchema7;

      const out = sanitizeToolSchemasForProvider(
        { t: mcpTool(schema) },
        'openrouter' as ProviderId,
        'openai/gpt-4o',
      );

      expect((resolvedSchema(out.t).properties!.mode as JSONSchema7).enum).toEqual(['x']);
    });
  });
});
