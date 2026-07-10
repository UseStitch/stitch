import { generateText, Output } from 'ai';
import { z } from 'zod';

import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { createProvider } from '@/llm/provider/provider.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { buildConsolidationPrompt, consolidationSchema } from '@/memory/prompts.js';
import {
  addSemanticMemory,
  deleteSemanticMemory,
  getAllSemanticMemories,
  searchSemanticMemories,
  updateSemanticMemory,
} from '@/memory/service.js';
import type { MemorySource, SemanticMemory } from '@/memory/types.js';

const log = Log.create({ service: 'memory-consolidation' });

const MAX_GROUPS = 5;
const MAX_MEMORIES_PER_GROUP = 8;
const SIMILARITY_THRESHOLD = 0.82;
const MIN_GROUP_SIZE = 3;
const MAX_CONTENT_LENGTH = 500;
const MAX_ACTIONS_PER_GROUP = 20;

type ConsolidationAction = z.infer<typeof consolidationSchema>['actions'][number];

type ConsolidationMemory = Pick<
  SemanticMemory,
  'id' | 'content' | 'category' | 'confidence' | 'source' | 'sourceId' | 'pinned' | 'updatedAt'
> & { score?: number };

type ValidatedAction =
  | { action: 'ADD'; content: string; category: SemanticMemory['category']; confidence: SemanticMemory['confidence'] }
  | { action: 'UPDATE'; memoryId: string; content: string }
  | { action: 'DELETE'; memoryId: string };

export type ConsolidationResult = {
  groupsReviewed: number;
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
};

function emptyResult(): ConsolidationResult {
  return { groupsReviewed: 0, added: 0, updated: 0, deleted: 0, skipped: 0 };
}

function isUsableContent(content: string | null): content is string {
  return content !== null && content.trim().length > 0 && content.trim().length <= MAX_CONTENT_LENGTH;
}

export function validateConsolidationActions(
  group: ConsolidationMemory[],
  actions: ConsolidationAction[],
): { valid: ValidatedAction[]; skipped: number } {
  const byId = new Map(group.map((memory) => [memory.id, memory]));
  const valid: ValidatedAction[] = [];
  let skipped = 0;
  let deletes = 0;

  for (const action of actions.slice(0, MAX_ACTIONS_PER_GROUP)) {
    if (action.action === 'NONE') {
      skipped++;
      continue;
    }

    if (action.action === 'ADD') {
      if (!isUsableContent(action.content) || !action.category || !action.confidence) {
        skipped++;
        continue;
      }
      valid.push({
        action: 'ADD',
        content: action.content.trim(),
        category: action.category,
        confidence: action.confidence,
      });
      continue;
    }

    if (!action.memoryId) {
      skipped++;
      continue;
    }

    const memory = byId.get(action.memoryId);
    if (!memory) {
      skipped++;
      continue;
    }

    if (action.action === 'UPDATE') {
      if (!isUsableContent(action.content) || action.content.trim() === memory.content) {
        skipped++;
        continue;
      }
      valid.push({ action: 'UPDATE', memoryId: action.memoryId, content: action.content.trim() });
      continue;
    }

    if (action.action === 'DELETE') {
      if (memory.pinned || deletes >= group.length - 1) {
        skipped++;
        continue;
      }
      deletes++;
      valid.push({ action: 'DELETE', memoryId: action.memoryId });
    }
  }

  skipped += Math.max(0, actions.length - MAX_ACTIONS_PER_GROUP);
  return { valid, skipped };
}

function addCounts(result: ConsolidationResult, delta: ConsolidationResult): void {
  result.groupsReviewed += delta.groupsReviewed;
  result.added += delta.added;
  result.updated += delta.updated;
  result.deleted += delta.deleted;
  result.skipped += delta.skipped;
}

async function findCandidateGroups(): Promise<ConsolidationMemory[][]> {
  const allResult = await getAllSemanticMemories({ page: 1, pageSize: 1000 });
  if (allResult.error || allResult.data.memories.length < MIN_GROUP_SIZE) return [];

  const memories = [...allResult.data.memories].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const used = new Set<string>();
  const groups: ConsolidationMemory[][] = [];

  for (const memory of memories) {
    if (groups.length >= MAX_GROUPS) break;
    if (used.has(memory.id)) continue;

    const similarResult = await searchSemanticMemories({
      query: memory.content,
      page: 1,
      pageSize: MAX_MEMORIES_PER_GROUP,
    });
    if (similarResult.error) continue;

    const related = similarResult.data.memories
      .filter((candidate) => candidate.id !== memory.id && candidate.score >= SIMILARITY_THRESHOLD)
      .filter((candidate) => !used.has(candidate.id))
      .slice(0, MAX_MEMORIES_PER_GROUP - 1);

    if (related.length + 1 < MIN_GROUP_SIZE) continue;

    const group = [memory, ...related];
    for (const item of group) used.add(item.id);
    groups.push(group);
  }

  return groups;
}

function getAddSource(group: ConsolidationMemory[]): { source: MemorySource; sourceId: string } {
  return { source: group[0]?.source ?? 'chat', sourceId: group[0]?.sourceId ?? 'consolidation' };
}

async function applyActions(
  group: ConsolidationMemory[],
  actions: ConsolidationAction[],
): Promise<Omit<ConsolidationResult, 'groupsReviewed'>> {
  const { valid, skipped } = validateConsolidationActions(group, actions);
  const result = { added: 0, updated: 0, deleted: 0, skipped };
  const addSource = getAddSource(group);

  for (const action of valid) {
    if (action.action === 'ADD') {
      await addSemanticMemory(
        { content: action.content, category: action.category, confidence: action.confidence },
        addSource.source,
        addSource.sourceId,
      );
      result.added++;
    } else if (action.action === 'UPDATE') {
      const updateResult = await updateSemanticMemory(action.memoryId, { content: action.content });
      if (updateResult.error) result.skipped++;
      else result.updated++;
    } else {
      const deleteResult = await deleteSemanticMemory(action.memoryId);
      if (deleteResult.error) result.skipped++;
      else result.deleted++;
    }
  }

  return result;
}

export async function consolidateMemories(): Promise<ConsolidationResult> {
  const groups = await findCandidateGroups();
  if (groups.length === 0) return emptyResult();

  const resolved = await resolveCheapModel({
    providerIdKey: 'model.title.providerId',
    modelIdKey: 'model.title.modelId',
    fallbackProviderId: '',
    fallbackModelId: '',
  });
  if (!resolved) {
    log.warn('no model available for memory consolidation');
    return emptyResult();
  }

  const model = createProvider(resolved.credentials)(resolved.modelId);
  const totals = emptyResult();

  for (const group of groups) {
    totals.groupsReviewed++;
    try {
      const startedAt = Date.now();
      const output = await generateText({
        model,
        output: Output.object({ schema: consolidationSchema }),
        messages: [{ role: 'user', content: buildConsolidationPrompt(group) }],
      });
      const endedAt = Date.now();

      if (output.usage) {
        internalBus.emit('usage.memory.completed', {
          providerId: resolved.providerId,
          modelId: resolved.modelId,
          usage: output.usage,
          phase: 'consolidation',
          startedAt,
          endedAt,
        });
      }

      const applied = await applyActions(group, output.output?.actions ?? []);
      addCounts(totals, { groupsReviewed: 0, ...applied });
    } catch (error) {
      totals.skipped++;
      log.warn({ error, groupSize: group.length }, 'memory consolidation group failed');
    }
  }

  log.info(totals, 'memory consolidation complete');
  return totals;
}
