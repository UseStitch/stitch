import { describe, expect, test } from 'bun:test';

import type { ToolTypeInfo } from '@/code-mode/bindings/tool-binding.js';
import { generateTypeStubs } from '@/code-mode/bindings/type-generator.js';

describe('generateTypeStubs', () => {
  test('generates type stub for a simple tool', () => {
    const bindings: Record<string, ToolTypeInfo> = {
      external_read: {
        name: 'external_read',
        description: 'Read a file from disk',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file' },
          },
          required: ['filePath'],
        },
      },
    };

    const result = generateTypeStubs(bindings);

    expect(result).toContain('type ExternalReadInput');
    expect(result).toContain('filePath: string');
    expect(result).toContain('declare function external_read(input: ExternalReadInput): Promise<unknown>');
    expect(result).toContain('/** Read a file from disk */');
  });

  test('generates optional properties for non-required fields', () => {
    const bindings: Record<string, ToolTypeInfo> = {
      external_search: {
        name: 'external_search',
        description: 'Search files',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['query'],
        },
      },
    };

    const result = generateTypeStubs(bindings);

    expect(result).toContain('query: string');
    expect(result).toContain('limit?: number');
  });

  test('handles array types', () => {
    const bindings: Record<string, ToolTypeInfo> = {
      external_batch: {
        name: 'external_batch',
        description: 'Batch operation',
        inputSchema: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { type: 'string' } },
          },
          required: ['items'],
        },
      },
    };

    const result = generateTypeStubs(bindings);
    expect(result).toContain('items: string[]');
  });

  test('handles enum types', () => {
    const bindings: Record<string, ToolTypeInfo> = {
      external_action: {
        name: 'external_action',
        description: 'Perform action',
        inputSchema: {
          type: 'object',
          properties: {
            mode: { enum: ['fast', 'slow', 'auto'] },
          },
          required: ['mode'],
        },
      },
    };

    const result = generateTypeStubs(bindings);
    expect(result).toContain('"fast" | "slow" | "auto"');
  });

  test('handles nested objects', () => {
    const bindings: Record<string, ToolTypeInfo> = {
      external_create: {
        name: 'external_create',
        description: 'Create resource',
        inputSchema: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                enabled: { type: 'boolean' },
              },
              required: ['name'],
            },
          },
          required: ['config'],
        },
      },
    };

    const result = generateTypeStubs(bindings);
    expect(result).toContain('name: string');
    expect(result).toContain('enabled?: boolean');
  });

  test('handles anyOf/oneOf union types', () => {
    const bindings: Record<string, ToolTypeInfo> = {
      external_flex: {
        name: 'external_flex',
        description: 'Flexible input',
        inputSchema: {
          type: 'object',
          properties: {
            value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
          },
          required: ['value'],
        },
      },
    };

    const result = generateTypeStubs(bindings);
    expect(result).toContain('string | number');
  });

  test('excludes descriptions when includeDescriptions is false', () => {
    const bindings: Record<string, ToolTypeInfo> = {
      external_tool: {
        name: 'external_tool',
        description: 'A tool description',
        inputSchema: { type: 'object', properties: {} },
      },
    };

    const result = generateTypeStubs(bindings, { includeDescriptions: false });
    expect(result).not.toContain('/** A tool description */');
  });

  test('handles empty bindings', () => {
    const result = generateTypeStubs({});
    expect(result).toBe('');
  });

  test('handles empty object schema with no properties', () => {
    const bindings: Record<string, ToolTypeInfo> = {
      external_noop: {
        name: 'external_noop',
        description: 'No-op tool',
        inputSchema: { type: 'object', properties: {} },
      },
    };

    const result = generateTypeStubs(bindings);
    expect(result).toContain('type ExternalNoopInput');
  });

  test('generates multiple stubs', () => {
    const bindings: Record<string, ToolTypeInfo> = {
      external_read: {
        name: 'external_read',
        description: 'Read',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
      external_write: {
        name: 'external_write',
        description: 'Write',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' } },
          required: ['path', 'content'],
        },
      },
    };

    const result = generateTypeStubs(bindings);
    expect(result).toContain('declare function external_read');
    expect(result).toContain('declare function external_write');
    expect(result).toContain('type ExternalReadInput');
    expect(result).toContain('type ExternalWriteInput');
  });
});
