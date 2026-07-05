import type { ToolBinding } from '@stitch/sandbox';

import type { Tool } from 'ai';

const EXTERNAL_PREFIX = 'external_';

export type ToolTypeInfo = { name: string; description: string; inputSchema: Record<string, unknown> };

/**
 * Extracts JSON schema from a tool's parameters, handling multiple possible
 * locations where the schema may be stored across different ai SDK versions.
 */
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

function getToolSchema(tool: Tool): Record<string, unknown> {
  return extractJsonSchema(
    (tool as unknown as Record<string, unknown>)['parameters'] ??
      (tool as unknown as Record<string, unknown>)['inputSchema'],
  );
}

type ToolMeta = {
  originalName: string;
  bindingName: string;
  description: string;
  schema: Record<string, unknown>;
  tool: Tool;
};

function mapExecutableTools<T>(tools: Record<string, Tool>, mapper: (meta: ToolMeta) => T): Record<string, T> {
  const result: Record<string, T> = {};

  for (const [name, tool] of Object.entries(tools)) {
    if (!tool.execute) continue;

    const bindingName = `${EXTERNAL_PREFIX}${name}`;
    const description = tool.description ?? `Tool: ${name}`;
    const schema = getToolSchema(tool);

    result[bindingName] = mapper({ originalName: name, bindingName, description, schema, tool });
  }

  return result;
}

/**
 * Extracts only the metadata (name, description, schema) needed for type stub
 * generation. Does not create execute wrappers — use this for the system prompt
 * path where execution is not needed.
 */
export function toolsToTypeInfo(tools: Record<string, Tool>): Record<string, ToolTypeInfo> {
  return mapExecutableTools(tools, ({ bindingName, description, schema }) => ({
    name: bindingName,
    description,
    inputSchema: schema,
  }));
}

export function toolsToBindings(tools: Record<string, Tool>, abortSignal?: AbortSignal): Record<string, ToolBinding> {
  return mapExecutableTools(tools, ({ bindingName, description, schema, tool }) => {
    const execute = tool.execute!;
    return {
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
  });
}
