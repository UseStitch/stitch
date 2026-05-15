import type { ToolBinding } from '@/code-mode/isolate/types.js';
import type { Tool } from 'ai';

const EXTERNAL_PREFIX = 'external_';

function extractJsonSchema(schema: unknown): Record<string, unknown> {
  if (!schema) return { type: 'object', properties: {} };

  const s = schema as Record<string, unknown>;

  if (typeof s['type'] === 'string' || typeof s['properties'] === 'object') {
    return s;
  }

  if (s['jsonSchema'] && typeof s['jsonSchema'] === 'object') {
    return s['jsonSchema'] as Record<string, unknown>;
  }

  return { type: 'object', properties: {} };
}

export function toolsToBindings(
  tools: Record<string, Tool>,
  abortSignal?: AbortSignal,
): Record<string, ToolBinding> {
  const bindings: Record<string, ToolBinding> = {};

  for (const [name, tool] of Object.entries(tools)) {
    if (!tool.execute) continue;

    const bindingName = `${EXTERNAL_PREFIX}${name}`;
    const description = tool.description ?? `Tool: ${name}`;
    const schema = extractJsonSchema(
      (tool as unknown as Record<string, unknown>)['parameters'] ??
        (tool as unknown as Record<string, unknown>)['inputSchema'],
    );

    const execute = tool.execute;
    bindings[bindingName] = {
      name: bindingName,
      description,
      inputSchema: schema,
      execute: async (input: unknown, signal?: AbortSignal) => {
        const effectiveSignal = signal ?? abortSignal;
        return execute(
          input as Parameters<typeof execute>[0],
          {
            toolCallId: `code-mode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            messages: [],
            skipTruncation: true,
            abortSignal: effectiveSignal,
          } as unknown as Parameters<typeof execute>[1],
        );
      },
    };
  }

  return bindings;
}
