import { getMemoryConfig } from '@/memory/config.js';
import {
  searchSemanticMemories,
  touchSemanticMemories,
} from '@/memory/service.js';
import type { MemorySource } from '@/memory/types.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'memory-retriever' });

const SEMANTIC_LIMIT = 10;
const MIN_RELEVANCE_SCORE = 0.3;

/**
 * Retrieve relevant memories for the current conversation context.
 * Returns a formatted string to be injected into the system prompt,
 * or null if memory is disabled or no relevant memories exist.
 *
 * @param query - The user message text to search against.
 * @param sourceFilter - When set, only semantic memories from this source are returned.
 *   Automations pass `undefined` to read all memories; chat passes `'chat'`.
 */
export async function retrieveMemoryContext(
  query: string,
  sourceFilter?: MemorySource,
): Promise<string | null> {
  try {
    const config = await getMemoryConfig();
    if (!config.enabled) return null;

    const semantic = await searchSemanticMemories(query, SEMANTIC_LIMIT, sourceFilter);
    const relevant = semantic.filter((m) => m.score >= MIN_RELEVANCE_SCORE);

    if (relevant.length === 0) return null;

    touchSemanticMemories(relevant.map((m) => m.id)).catch((err) =>
      log.warn({ error: err }, 'failed to touch semantic memories'),
    );

    const entries = relevant.map(
      (m) => `- [${m.category}] ${m.content} (confidence: ${m.confidence})`,
    );

    log.debug({ semanticCount: relevant.length }, 'retrieved memory context');

    return `Known facts about the user:\n${entries.join('\n')}`;
  } catch (error) {
    log.error({ error }, 'failed to retrieve memory context');
    return null;
  }
}
