import { z } from 'zod';

import { MEMORY_CATEGORIES, MEMORY_CONFIDENCES } from '@/memory/types.js';
import type { MemoryCategory, MemoryConfidence } from '@/memory/types.js';

// ---------------------------------------------------------------------------
// Schemas — used as structured output targets for generateText
// ---------------------------------------------------------------------------

export const extractionSchema = z.object({
  facts: z.array(
    z.object({
      content: z.string().describe('A single, self-contained statement about the user.'),
      category: z.enum(MEMORY_CATEGORIES).describe('The category of the fact.'),
      confidence: z.enum(MEMORY_CONFIDENCES).describe('"stated" if explicit, "inferred" if implied.'),
    }),
  ),
});

export const deduplicationSchema = z.object({
  action: z
    .enum(['ADD', 'UPDATE', 'DELETE', 'NONE'])
    .describe(
      'ADD = new fact, UPDATE = refines an existing memory, DELETE = contradicts an existing memory, NONE = already captured.',
    ),
  existingMemoryId: z
    .string()
    .nullable()
    .describe('The id of the existing memory to update or delete. Null for ADD/NONE.'),
  updatedContent: z
    .string()
    .nullable()
    .describe('The merged/updated content when action is UPDATE. Null otherwise.'),
});

// ---------------------------------------------------------------------------
// Prompt builders — return the system/user content; schema is applied via
// the AI SDK `output` option, so prompts no longer include JSON instructions.
// ---------------------------------------------------------------------------

/**
 * Prompt sent to the LLM to extract memorable facts from a conversation turn.
 */
export function buildExtractionPrompt(userMessage: string, assistantMessage: string): string {
  return `You are a memory extraction system. Analyze the following conversation turn and extract any facts, preferences, constraints, or workflows the user has explicitly stated or strongly implied.

Rules:
- Only extract information about the USER, not the assistant.
- Each fact must be a single, self-contained statement.
- Do NOT extract trivial greetings, filler, or task-specific instructions that have no lasting value.
- Do NOT extract information the assistant said unless the user confirmed it.
- Prefer specifics over vague statements.
- If there is nothing to extract, return an empty facts array.

Categories:
- "preference": Things the user likes, prefers, or wants (e.g. "prefers dark mode", "likes TypeScript over JavaScript")
- "fact": Objective information about the user (e.g. "works at Acme Corp", "uses macOS")
- "workflow": How the user likes to work or processes they follow (e.g. "always runs tests before committing")
- "constraint": Limitations or rules the user operates under (e.g. "cannot use GPL libraries", "must support IE11")

<user_message>
${userMessage}
</user_message>

<assistant_message>
${assistantMessage}
</assistant_message>`;
}

/**
 * Prompt sent to the LLM to decide what to do with each extracted fact
 * compared to existing memories.
 */
export function buildDeduplicationPrompt(
  fact: { content: string; category: MemoryCategory; confidence: MemoryConfidence },
  existingMemories: { id: string; content: string; category: string }[],
): string {
  const memoriesBlock =
    existingMemories.length === 0
      ? 'No existing memories found.'
      : existingMemories
          .map((m, i) => `[${i}] id="${m.id}" category="${m.category}": ${m.content}`)
          .join('\n');

  return `You are a memory deduplication system. Given a newly extracted fact and a list of existing memories, decide what action to take.

Actions:
- "ADD": The fact is new and not covered by any existing memory. Add it.
- "UPDATE": The fact updates, corrects, or refines an existing memory. Provide the existingMemoryId and the updated content.
- "DELETE": The fact contradicts an existing memory and the existing memory should be removed. Provide the existingMemoryId.
- "NONE": The fact is already captured by an existing memory with no meaningful difference. Skip it.

<new_fact>
content: ${fact.content}
category: ${fact.category}
confidence: ${fact.confidence}
</new_fact>

<existing_memories>
${memoriesBlock}
</existing_memories>`;
}
