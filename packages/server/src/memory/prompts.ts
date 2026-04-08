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
      confidence: z
        .enum(MEMORY_CONFIDENCES)
        .describe('"stated" if explicit, "inferred" if implied.'),
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
- "ADD": The fact is genuinely new information not covered by any existing memory.
- "UPDATE": The fact refines or extends an existing memory with meaningfully new detail. Provide existingMemoryId and the merged updatedContent.
- "DELETE": An existing memory is now FACTUALLY WRONG because this new fact directly contradicts it (e.g. old memory says "uses Windows", new fact says "switched to macOS"). Only use this when the existing memory is objectively incorrect. Provide existingMemoryId.
- "NONE": The fact is already captured, is essentially identical, or is only a minor rephrasing of an existing memory. When in doubt, use NONE.

Important rules:
- The assistant RECITING a memory back to the user is NOT a contradiction — do not DELETE in this case.
- Prefer NONE over DELETE. Only DELETE when the existing memory is clearly and factually wrong.
- Prefer NONE over UPDATE for minor wording differences.

<new_fact>
content: ${fact.content}
category: ${fact.category}
confidence: ${fact.confidence}
</new_fact>

<existing_memories>
${memoriesBlock}
</existing_memories>`;
}
