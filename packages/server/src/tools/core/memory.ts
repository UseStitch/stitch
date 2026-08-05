import { tool } from 'ai';
import { z } from 'zod';

import { getMemoryConfig } from '@/memory/config.js';
import { memoryFileStore } from '@/memory/file-store.js';
import type { MemoryMutation } from '@/memory/types.js';
import type { ToolDefinition } from '@/tools/runtime/pipeline.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

const targetSchema = z.enum(['memory', 'user']);
const operationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add'), content: z.string().min(1) }),
  z.object({ type: z.literal('replace'), oldText: z.string().min(1), content: z.string().min(1) }),
  z.object({ type: z.literal('remove'), oldText: z.string().min(1) }),
]);

const mutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), target: targetSchema, content: z.string().min(1) }),
  z.object({
    action: z.literal('replace'),
    target: targetSchema,
    oldText: z.string().min(1),
    content: z.string().min(1),
  }),
  z.object({ action: z.literal('remove'), target: targetSchema, oldText: z.string().min(1) }),
  z.object({ action: z.literal('batch'), target: targetSchema, operations: z.array(operationSchema).min(1).max(25) }),
]);

const DESCRIPTION = `Update curated long-term memory only when the user explicitly asks to remember, change, or forget something.

Use target "user" for stable preferences and profile directives. Use target "memory" for durable facts, decisions, constraints, and recurring work context. Do not store credentials, raw tool output, reminders, todos, transient task state, or conversation transcripts. Use session_history_search for exact prior conversation details.`;

function createMemoryTool(context: ToolContext) {
  return tool({
    description: DESCRIPTION,
    inputSchema: mutationSchema,
    execute: async (input) => {
      const config = await getMemoryConfig();
      if (!config.enabled) return { output: 'Memory is disabled. Enable memory.enabled in settings.' };

      const operations: MemoryMutation[] =
        input.action === 'batch'
          ? input.operations
          : input.action === 'add'
            ? [{ type: 'add', content: input.content, origin: 'agent', source: context.sessionId }]
            : input.action === 'replace'
              ? [{ type: 'replace', oldText: input.oldText, content: input.content }]
              : [{ type: 'remove', oldText: input.oldText }];
      const attributed = operations.map((operation) =>
        operation.type === 'add' ? { ...operation, origin: 'agent' as const, source: context.sessionId } : operation,
      );
      const snapshot = await memoryFileStore.mutate(input.target, attributed);
      return {
        output: `Updated ${snapshot.name}.`,
        entries: snapshot.entries,
        usage: snapshot.capacity,
        contentHash: snapshot.contentHash,
      };
    },
  });
}

function createMemorySearchTool() {
  return tool({
    description: `Search curated memory and daily memory candidates with deterministic lexical matching. Use this before answering questions about remembered facts or prior decisions not already present in curated context. Use session_history_search instead for exact conversation details.`,
    inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() }),
    execute: async ({ query, limit }) => ({ results: await memoryFileStore.search(query, limit ?? 10) }),
  });
}

function createMemoryGetTool() {
  return tool({
    description: `Read a bounded exact excerpt from MEMORY.md, USER.md, DREAMS.md, or daily/YYYY-MM-DD.md after memory_search identifies a relevant file. State and backup files are never readable.`,
    inputSchema: z.object({
      path: z.string().min(1),
      offset: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
    execute: async (input) => memoryFileStore.readLines(input.path, input.offset ?? 1, input.limit ?? 200),
  });
}

export function createMemoryDefinition(context: ToolContext): ToolDefinition {
  return { name: 'memory', displayName: 'Memory', tool: createMemoryTool(context) };
}

export function createMemorySearchDefinition(): ToolDefinition {
  return { name: 'memory_search', displayName: 'Memory Search', tool: createMemorySearchTool() };
}

export function createMemoryGetDefinition(): ToolDefinition {
  return { name: 'memory_get', displayName: 'Memory Get', tool: createMemoryGetTool() };
}
