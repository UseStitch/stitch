import { tool } from 'ai';
import { z } from 'zod';

import { getMemoryConfig } from '@/memory/config.js';
import {
  addSemanticMemory,
  deleteSemanticMemory,
  searchSemanticMemories,
  getAllSemanticMemories,
} from '@/memory/service.js';
import { MEMORY_CATEGORIES } from '@/memory/types.js';
import { isServiceError } from '@/lib/service-result.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';

export const DISPLAY_NAME = 'Memory';

const memoryInputSchema = z.object({
  action: z
    .enum(['remember', 'recall', 'forget', 'list'])
    .describe(
      'Action to perform: "remember" to store a fact, "recall" to search memories, "forget" to delete a memory, "list" to show all memories',
    ),
  content: z.string().optional().describe('The fact to remember, or the search query for recall'),
  category: z
    .enum(MEMORY_CATEGORIES)
    .optional()
    .describe('Category for the memory (preference, fact, workflow, constraint)'),
  memoryId: z.string().optional().describe('The ID of the memory to forget'),
});

const DESCRIPTION = `Manage long-term memories about the user. Only use this tool when the user explicitly asks to remember, recall, forget, or list memories. Background memory extraction already runs automatically after each conversation turn.

Use this tool to:
- "remember": Store a fact, preference, workflow, or constraint about the user when they explicitly ask you to remember something.
- "recall": Search for relevant memories using a natural language query when the user asks what you know about them.
- "forget": Delete a specific memory by ID when the user asks to remove something.
- "list": Show all stored memories when the user asks to see their memories.

Do NOT proactively use this tool. Memories are already injected into context automatically.`;

function createMemoryTool(context: ToolContext) {
  return tool({
    description: DESCRIPTION,
    inputSchema: memoryInputSchema,
    execute: async (input) => {
      const config = await getMemoryConfig();
      if (!config.enabled) {
        return { output: 'Memory is disabled. Enable it in settings (memory.enabled).' };
      }

      switch (input.action) {
        case 'remember': {
          if (!input.content) {
            return { output: 'Please provide content to remember.' };
          }

          const result = await addSemanticMemory(
            {
              content: input.content,
              category: input.category ?? 'fact',
              confidence: 'stated',
            },
            'chat',
            context.sessionId,
          );

          if (isServiceError(result)) {
            return { output: `Failed to remember: ${result.error}` };
          }

          const memory = result.data;
          return {
            output: `Remembered: "${memory.content}" (id: ${memory.id}, category: ${memory.category})`,
          };
        }

        case 'recall': {
          if (!input.content) {
            return { output: 'Please provide a search query.' };
          }

          const result = await searchSemanticMemories({
            query: input.content,
            page: 1,
            pageSize: 10,
            sourceFilter: 'chat',
          });

          if (isServiceError(result)) {
            return { output: `Failed to recall: ${result.error}` };
          }

          const memories = result.data.memories;
          if (memories.length === 0) {
            return { output: 'No relevant memories found.' };
          }

          const lines = memories.map(
            (m) =>
              `- [${m.category}] ${m.content} (id: ${m.id}, confidence: ${m.confidence}, score: ${m.score.toFixed(2)})`,
          );

          return { output: `Found ${result.data.total} memories:\n${lines.join('\n')}` };
        }

        case 'forget': {
          if (!input.memoryId) {
            return { output: 'Please provide the memoryId to forget.' };
          }

          const result = await deleteSemanticMemory(input.memoryId);
          if (isServiceError(result)) {
            return { output: `Failed to forget: ${result.error}` };
          }
          return { output: `Deleted memory ${input.memoryId}.` };
        }

        case 'list': {
          const result = await getAllSemanticMemories({
            page: 1,
            pageSize: 1000,
            sourceFilter: 'chat',
          });

          if (isServiceError(result)) {
            return { output: `Failed to list memories: ${result.error}` };
          }

          const memories = result.data.memories;
          if (memories.length === 0) {
            return { output: 'No memories stored yet.' };
          }

          const lines = memories.map(
            (m) => `- [${m.category}] ${m.content} (id: ${m.id}, confidence: ${m.confidence})`,
          );

          return { output: `${result.data.total} memories:\n${lines.join('\n')}` };
        }
      }
    },
  });
}

export function createRegisteredTool(context: ToolContext) {
  return createMemoryTool(context);
}
