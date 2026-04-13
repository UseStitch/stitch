import * as Log from '@/lib/log.js';
import { getMemoryConfig, isMemoryActive } from '@/memory/config.js';
import { searchSemanticMemories, touchSemanticMemories } from '@/memory/service.js';
import type { MemorySource } from '@/memory/types.js';

const log = Log.create({ service: 'memory-retriever' });

function getRecencyFactor(dateStr: string): number {
  const ms = Date.parse(dateStr);
  if (!Number.isFinite(ms)) return 0;
  const days = (Date.now() - ms) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, days / 30); // 30 day half-life
}

function getConfidenceFactor(confidence: string): number {
  if (confidence === 'confirmed') return 0.9;
  if (confidence === 'stated') return 1.0;
  return 0.6; // inferred
}

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
  const config = await getMemoryConfig();
  if (!isMemoryActive(config)) return null;

  const semantic = await searchSemanticMemories({
    query,
    page: 1,
    pageSize: config.retrievalMaxResults * 2, // Fetch more for blended scoring
    sourceFilter,
  });

  // Apply base threshold filter first
  let candidates = semantic.memories.filter((m) => m.score >= config.retrievalMinScore);

  if (config.retrievalRecencyBoost) {
    const scoredCandidates = candidates.map(m => {
      const blendedScore = (m.score * 0.7) + (getRecencyFactor(m.lastAccessedAt) * 0.2) + (getConfidenceFactor(m.confidence) * 0.1);
      return { ...m, blendedScore };
    });
    
    scoredCandidates.sort((a, b) => b.blendedScore - a.blendedScore);
    candidates = scoredCandidates;
  }

  const relevant = candidates.slice(0, config.retrievalMaxResults);

  if (relevant.length === 0) return null;

  touchSemanticMemories(relevant.map((m) => m.id)).catch((err) =>
    log.warn({ error: err }, 'failed to touch semantic memories'),
  );

  const entries = relevant.map(
    (m) => `- [${m.category}] ${m.content} (confidence: ${m.confidence})`,
  );

  log.debug({ semanticCount: relevant.length }, 'retrieved memory context');

  return `Known facts about the user:\n${entries.join('\n')}`;
}
