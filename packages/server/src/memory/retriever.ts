import * as Log from '@/lib/log.js';
import { getMemoryConfig, isMemoryActive } from '@/memory/config.js';
import { searchSemanticMemories, touchSemanticMemories } from '@/memory/service.js';
import type { MemoryCategory } from '@/memory/types.js';
import type { MemorySource } from '@/memory/types.js';

const log = Log.create({ service: 'memory-retriever' });
const CHAT_MEMORY_CATEGORIES: MemoryCategory[] = ['preference', 'fact', 'constraint'];

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  );
}

function getLexicalFactor(query: string, content: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return 0;

  const contentTokens = tokenize(content);
  if (contentTokens.size === 0) return 0;

  let shared = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / queryTokens.size;
}

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
export async function retrieveMemoryContext(query: string, sourceFilter?: MemorySource): Promise<string | null> {
  const config = await getMemoryConfig();
  if (!isMemoryActive(config)) return null;

  const semanticResult = await searchSemanticMemories({
    query,
    page: 1,
    pageSize: config.retrievalMaxResults * 4, // Fetch more for blended scoring and filtering
    sourceFilter,
  });

  if (semanticResult.error) return null;
  const semantic = semanticResult.data;

  // Apply category and score filters before reranking.
  const candidates = semantic.memories.filter(
    (m) => CHAT_MEMORY_CATEGORIES.includes(m.category) && m.score >= config.retrievalMinScore,
  );

  const scoredCandidates = candidates.map((m) => {
    const lexicalFactor = getLexicalFactor(query, m.content);
    const recencyFactor = config.retrievalRecencyBoost ? getRecencyFactor(m.lastAccessedAt) : 0;
    const confidenceFactor = getConfidenceFactor(m.confidence);
    const blendedScore = m.score * 0.6 + lexicalFactor * 0.25 + recencyFactor * 0.1 + confidenceFactor * 0.05;
    return { ...m, blendedScore };
  });

  scoredCandidates.sort((a, b) => b.blendedScore - a.blendedScore);

  const relevant = scoredCandidates.slice(0, config.retrievalMaxResults);

  if (relevant.length === 0) return null;

  touchSemanticMemories(relevant.map((m) => m.id)).catch((err) =>
    log.warn({ error: err }, 'failed to touch semantic memories'),
  );

  const entries = relevant.map((m) => `- [${m.category}] ${m.content} (confidence: ${m.confidence})`);

  log.debug({ semanticCount: relevant.length }, 'retrieved memory context');

  return `Known facts about the user:\n${entries.join('\n')}`;
}
