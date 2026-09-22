import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

import type { ToolBinding } from '@stitch/sandbox';

import { ToolValidationError } from '@/tools/errors.js';
import type { ToolExecuteOptions } from '@/tools/runtime/runtime.js';
import type { Tool } from 'ai';

const EXTERNAL_PREFIX = 'external_';
const validator = new AjvJsonSchemaValidator();

type JsonSchemaValue = boolean | null | number | string | JsonSchemaValue[] | { [key: string]: JsonSchemaValue };
type JsonSchema = { [keyword: string]: JsonSchemaValue };
type ToolMap<T> = Record<string, T>;
type ToolBindingInput = Parameters<ToolBinding['execute']>[0];

export type ToolTypeInfo = { name: string; description: string; inputSchema: JsonSchema };

function getToolSchema(tool: Tool): JsonSchema {
  // SAFETY: AI SDK JSON schemas are JSON-compatible objects by contract.
  const inputSchema = tool.inputSchema as { jsonSchema?: JsonSchema } | undefined;
  return inputSchema?.jsonSchema ?? { type: 'object', properties: {} };
}

type ToolMeta = {
  originalName: string;
  bindingName: string;
  description: string;
  schema: JsonSchema;
  execute: NonNullable<Tool['execute']>;
};

function mapExecutableTools<T>(tools: ToolMap<Tool>, mapper: (meta: ToolMeta) => T): ToolMap<T> {
  const result: ToolMap<T> = {};

  for (const [name, tool] of Object.entries(tools)) {
    const execute = tool.execute;
    if (!execute) continue;

    const bindingName = `${EXTERNAL_PREFIX}${name}`;
    const description = tool.description ?? `Tool: ${name}`;
    const schema = getToolSchema(tool);

    result[bindingName] = mapper({ originalName: name, bindingName, description, schema, execute });
  }

  return result;
}

/**
 * Extracts only the metadata (name, description, schema) needed for type stub
 * generation. Does not create execute wrappers — use this for the system prompt
 * path where execution is not needed.
 */
export function toolsToTypeInfo(tools: ToolMap<Tool>): ToolMap<ToolTypeInfo> {
  return mapExecutableTools(tools, ({ bindingName, description, schema }) => ({
    name: bindingName,
    description,
    inputSchema: schema,
  }));
}

export function toolsToBindings(tools: ToolMap<Tool>, abortSignal?: AbortSignal): ToolMap<ToolBinding> {
  return mapExecutableTools(tools, ({ bindingName, description, schema, execute }) => {
    const validate = validator.getValidator(schema);
    return {
      name: bindingName,
      description,
      inputSchema: schema,
      validateInput: (input: ToolBindingInput) => {
        const result = validate(input);
        if (!result.valid) throw new ToolValidationError(result.errorMessage, bindingName);
      },
      execute: async (input: ToolBindingInput, signal?: AbortSignal) => {
        const effectiveSignal = signal ?? abortSignal;
        const options: ToolExecuteOptions = {
          toolCallId: `code-mode-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          messages: [],
          skipTruncation: true,
          abortSignal: effectiveSignal,
        };
        return execute(input, options);
      },
    };
  });
}
