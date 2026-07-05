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
      importanceScore: z
        .number()
        .min(0)
        .max(1)
        .describe(
          'How valuable this fact will be in future sessions (0–1). High score = prevents user from repeating themselves. Low score = ephemeral or obvious.',
        ),
      durability: z
        .enum(['ephemeral', 'session', 'long_term'])
        .describe(
          '"long_term" if this fact remains true across sessions. "session" if likely only relevant to the current task. "ephemeral" if it will be outdated very quickly.',
        ),
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
  updatedContent: z.string().nullable().describe('The merged/updated content when action is UPDATE. Null otherwise.'),
});

export const consolidationSchema = z.object({
  actions: z.array(
    z.object({
      action: z
        .enum(['ADD', 'UPDATE', 'DELETE', 'NONE'])
        .describe(
          'ADD = new merged fact, UPDATE = improve one existing memory, DELETE = remove a superseded or contradicted memory, NONE = leave unchanged.',
        ),
      memoryId: z.string().nullable().describe('The existing memory id for UPDATE, DELETE, or NONE. Null for ADD.'),
      content: z.string().nullable().describe('The memory content for ADD or UPDATE. Null for DELETE/NONE.'),
      category: z.enum(MEMORY_CATEGORIES).nullable().describe('Category for ADD. Null otherwise.'),
      confidence: z.enum(MEMORY_CONFIDENCES).nullable().describe('Confidence for ADD. Null otherwise.'),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Prompt builders — return the system/user content; schema is applied via
// the AI SDK `output` option, so prompts no longer include JSON instructions.
// ---------------------------------------------------------------------------

/**
 * Prompt sent to the LLM to extract memorable facts from a conversation turn.
 */
export function buildExtractionPrompt(userMessage: string, assistantMessage: string): string {
  return `You are a memory extraction system. Analyze the following conversation turn and extract any facts, preferences, or constraints the user has explicitly stated or strongly implied.

Rules:
- Only extract information about the USER, not the assistant.
- Extract at most 1–2 facts per turn. Be highly selective — only the most durable, reusable facts.
- Strongly prefer "stated" confidence. Only use "inferred" when the implication is very strong and specific.
- Skip trivial or ephemeral information: greetings, acknowledgments, task-specific file paths, temporary variable names, single-use instructions.
- Skip information about the user's temporary workflow for the current task, even if it sounds procedural.
- Skip information that is only relevant to the current task and has no lasting value across sessions.
- Each fact must be a single, self-contained statement.
- Do NOT extract trivial greetings, filler, or task-specific instructions that have no lasting value.
- Do NOT extract information the assistant said unless the user confirmed it.
- Prefer specifics over vague statements.
- If there is nothing durable to extract, return an empty facts array.

Categories:
- "preference": Things the user likes, prefers, or wants (e.g. "prefers dark mode", "likes TypeScript over JavaScript")
- "fact": Objective information about the user (e.g. "works at Acme Corp", "uses macOS")
- "constraint": Limitations or rules the user operates under (e.g. "cannot use GPL libraries", "must support IE11")

Importance scoring (importanceScore 0-1):
- 0.9-1.0: User explicitly asked to remember this, or corrected a wrong assumption. Will prevent frustration if recalled.
- 0.7-0.9: Clear stable preference, environment fact, or durable constraint that will save future back-and-forth.
- 0.5-0.7: Useful but not critical. Saves minor friction.
- Below 0.5: Ephemeral, obvious, or easily re-discovered. Do not extract these.

Durability:
- "long_term": Stable across sessions (preferences, identity facts, constraints).
- "session": Likely only relevant to the current task or context window.
- "ephemeral": Will be outdated in hours/days (e.g. "user is currently debugging X issue").

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
      : existingMemories.map((m, i) => `[${i}] id="${m.id}" category="${m.category}": ${m.content}`).join('\n');

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
- If the new fact is very similar to an existing memory (just reworded), prefer NONE. Only use ADD for genuinely new information.
- Even if similarity is high (>0.85), still check for contradictions — a high-similarity fact can still be a contradiction (e.g. "uses Python 3.9" vs "uses Python 3.12").

<new_fact>
content: ${fact.content}
category: ${fact.category}
confidence: ${fact.confidence}
</new_fact>

<existing_memories>
${memoriesBlock}
</existing_memories>`;
}

export function buildConsolidationPrompt(
  memories: { id: string; content: string; category: string; confidence: string; pinned: boolean }[],
): string {
  const memoriesBlock = memories
    .map(
      (m, i) =>
        `[${i}] id="${m.id}" category="${m.category}" confidence="${m.confidence}" pinned=${m.pinned}: ${m.content}`,
    )
    .join('\n');

  return `You are a memory consolidation system. Given a small cluster of related long-term memories, produce safe cleanup actions.

Goals:
- Merge fragmented memories into clearer, self-contained memories.
- Remove exact duplicates or memories fully superseded by a better merged memory.
- Fix direct contradictions only when the contradiction is explicit.
- Preserve useful specificity. Do not replace specifics with vague summaries.

Rules:
- Do not invent facts. Every ADD or UPDATE must be fully supported by the provided memories.
- Never DELETE a pinned memory.
- Prefer NONE when a memory is already clear and non-duplicative.
- Prefer UPDATE over ADD when improving a single existing memory is enough.
- Use ADD only when several memories should be merged into a new single memory.
- If using ADD to merge memories, DELETE only the unpinned memories that are fully represented by the new content.
- Keep each content value as one concise, durable statement about the user.
- Do not include reasons or prose outside the structured output.

<memories>
${memoriesBlock}
</memories>`;
}
