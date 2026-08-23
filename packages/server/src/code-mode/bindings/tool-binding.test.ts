import { jsonSchema, tool } from 'ai';
import { describe, expect, test } from 'bun:test';

import { toolsToBindings } from '@/code-mode/bindings/tool-binding.js';

describe('toolsToBindings', () => {
  test('validates sandbox input against the tool schema', () => {
    const bindings = toolsToBindings({
      read: tool({
        description: 'read a file',
        inputSchema: jsonSchema({
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
          additionalProperties: false,
        }),
        execute: async ({ path }) => path,
      }),
    });
    const binding = bindings['external_read'];

    expect(binding).toBeDefined();
    expect(() => binding.validateInput({})).toThrow();
    expect(() => binding.validateInput({ path: '/tmp/file' })).not.toThrow();
  });
});
