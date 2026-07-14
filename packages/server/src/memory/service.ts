import { randomUUID } from 'node:crypto';

import * as Log from '@/lib/log.js';
import { computeTotalPages } from '@/lib/paginated-query.js';
import { ok, err } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { getSemanticTable } from '@/memory/store/tables.js';
import type {
  ListSemanticMemoriesResponse,
  SearchSemanticMemoriesResponse,
  MemoryCategory,
  SemanticMemory,
  MemorySource,
  ExtractedFact,
} from '@/memory/types.js';
import type { Embedder } from '@/models/embedding/embedder.js';
import { createEmbedder } from '@/models/embedding/factory.js';
import { recordEmbeddingUsage } from '@/usage/ledger.js';
import type { VectorQuery } from '@lancedb/lancedb';

export type MemoryStats = {
  total: number;
  pinned: number;
  stale: number;
  byCategory: Record<string, number>;
  byConfidence: Record<string, number>;
  avgAccessCount: number;
  oldestCreatedAt: string | null;
  newestCreatedAt: string | null;
};

const log = Log.create({ service: 'memory-service' });
const MAX_SEARCH_RESULTS = 1000;

function now(): string {
  return new Date().toISOString();
}

async function getEmbedder(): Promise<Embedder> {
  return createEmbedder();
}

/** Escape a string value for use in a LanceDB SQL where clause. */
function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Semantic memories
// ---------------------------------------------------------------------------

export async function addSemanticMemory(
  fact: ExtractedFact,
  source: SemanticMemory['source'],
  sourceId: string,
): Promise<SemanticMemory> {
  const embedder = await getEmbedder();
  const [embedResult, table] = await Promise.all([embedder.embed(fact.content), getSemanticTable(embedder.dimensions)]);
  void recordEmbeddingUsage({ providerId: embedder.providerId, modelId: embedder.modelId, tokens: embedResult.tokens });
  const timestamp = now();
  const id = randomUUID();

  const record = {
    id,
    content: fact.content,
    category: fact.category,
    confidence: fact.confidence,
    source,
    sourceId,
    createdAt: timestamp,
    updatedAt: timestamp,
    accessCount: 0,
    lastAccessedAt: timestamp,
    pinned: 0,
    vector: embedResult.embedding,
  };

  await table.add([record]);
  log.info({ id, category: fact.category }, 'added semantic memory');

  const { vector: _, pinned, ...rest } = record;
  return { ...rest, pinned: pinned === 1 };
}

type SemanticMemoryUpdate = {
  content?: string;
  category?: SemanticMemory['category'];
  confidence?: SemanticMemory['confidence'];
};

export async function updateSemanticMemory(id: string, updates: SemanticMemoryUpdate): Promise<ServiceResult<void>> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);
  const timestamp = now();

  const columns: Record<string, string> = { updatedAt: `'${escapeSql(timestamp)}'` };
  if (updates.category !== undefined) {
    columns.category = `'${escapeSql(updates.category)}'`;
  }
  if (updates.confidence !== undefined) {
    columns.confidence = `'${escapeSql(updates.confidence)}'`;
  }

  if (updates.content !== undefined) {
    // Content change requires re-embedding; vector is not a SQL scalar so fall back to delete+add.
    const embedResult = await embedder.embed(updates.content);
    void recordEmbeddingUsage({
      providerId: embedder.providerId,
      modelId: embedder.modelId,
      tokens: embedResult.tokens,
    });

    const existing = await table
      .query()
      .where(`id = '${escapeSql(id)}'`)
      .toArray();
    if (existing.length === 0) {
      return err('Memory not found', 404);
    }
    const row = existing[0];

    const newRecord = {
      id: row.id as string,
      content: updates.content,
      category: (updates.category ?? row.category) as string,
      confidence: (updates.confidence ?? row.confidence) as string,
      source: row.source as string,
      sourceId: row.sourceId as string,
      createdAt: row.createdAt as string,
      updatedAt: timestamp,
      accessCount: row.accessCount as number,
      lastAccessedAt: row.lastAccessedAt as string,
      pinned: row.pinned as number,
      vector: embedResult.embedding,
    };

    await table.delete(`id = '${escapeSql(id)}'`);
    await table.add([newRecord]);
  } else {
    await table.update({ valuesSql: columns, where: `id = '${escapeSql(id)}'` });
  }

  log.info({ id }, 'updated semantic memory');
  return ok(undefined);
}

export async function deleteSemanticMemory(id: string): Promise<ServiceResult<void>> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);
  await table.delete(`id = '${escapeSql(id)}'`);
  log.info({ id }, 'deleted semantic memory');
  return ok(undefined);
}

export async function deleteSemanticMemories(ids: string[]): Promise<ServiceResult<void>> {
  if (ids.length === 0) return ok(undefined);

  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);

  const escapedList = ids.map((id) => `'${escapeSql(id)}'`).join(', ');
  await table.delete(`id IN (${escapedList})`);
  log.info({ count: ids.length }, 'bulk deleted semantic memories');
  return ok(undefined);
}

export async function searchSemanticMemories(input: {
  query: string;
  page: number;
  pageSize: number;
  sourceFilter?: MemorySource;
  categoryFilter?: MemoryCategory;
}): Promise<ServiceResult<SearchSemanticMemoriesResponse>> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);

  const [count, embedResult] = await Promise.all([table.countRows(), embedder.embed(input.query)]);
  void recordEmbeddingUsage({ providerId: embedder.providerId, modelId: embedder.modelId, tokens: embedResult.tokens });
  if (count === 0) {
    return ok({ memories: [], page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 });
  }

  let search = (table.search(embedResult.embedding) as VectorQuery).distanceType('cosine').limit(MAX_SEARCH_RESULTS);

  const filters: string[] = [];
  if (input.sourceFilter) {
    filters.push(`source = '${escapeSql(input.sourceFilter)}'`);
  }
  if (input.categoryFilter) {
    filters.push(`category = '${escapeSql(input.categoryFilter)}'`);
  }

  if (filters.length > 0) {
    search = search.where(filters.join(' AND '));
  }

  const results = await search.toArray();
  const start = (input.page - 1) * input.pageSize;
  const end = start + input.pageSize;
  const pageRows = results.slice(start, end);
  const total = results.length;
  const totalPages = computeTotalPages(total, input.pageSize);

  return ok({
    memories: pageRows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      content: r.content as string,
      category: r.category as SemanticMemory['category'],
      confidence: r.confidence as SemanticMemory['confidence'],
      source: r.source as SemanticMemory['source'],
      sourceId: r.sourceId as string,
      createdAt: r.createdAt as string,
      updatedAt: r.updatedAt as string,
      accessCount: r.accessCount as number,
      lastAccessedAt: r.lastAccessedAt as string,
      pinned: (r.pinned as number) === 1,
      score: 1 - (r._distance as number),
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages,
  });
}

export async function getAllSemanticMemories(input: {
  page: number;
  pageSize: number;
  sourceFilter?: MemorySource;
  categoryFilter?: MemoryCategory;
}): Promise<ServiceResult<ListSemanticMemoriesResponse>> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);

  let query = table.query();
  const filters: string[] = [];
  if (input.sourceFilter) {
    filters.push(`source = '${escapeSql(input.sourceFilter)}'`);
  }
  if (input.categoryFilter) {
    filters.push(`category = '${escapeSql(input.categoryFilter)}'`);
  }

  if (filters.length > 0) {
    query = query.where(filters.join(' AND '));
  }

  const rows = await query.toArray();
  const start = (input.page - 1) * input.pageSize;
  const end = start + input.pageSize;
  const pageRows = rows.slice(start, end);
  const total = rows.length;
  const totalPages = computeTotalPages(total, input.pageSize);

  return ok({
    memories: pageRows.map((r) => ({
      id: r.id as string,
      content: r.content as string,
      category: r.category as SemanticMemory['category'],
      confidence: r.confidence as SemanticMemory['confidence'],
      source: r.source as SemanticMemory['source'],
      sourceId: r.sourceId as string,
      createdAt: r.createdAt as string,
      updatedAt: r.updatedAt as string,
      accessCount: r.accessCount as number,
      lastAccessedAt: r.lastAccessedAt as string,
      pinned: (r.pinned as number) === 1,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages,
  });
}

export async function touchSemanticMemories(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);
  const timestamp = now();

  const escapedList = ids.map((id) => `'${escapeSql(id)}'`).join(', ');
  await table.update({
    valuesSql: { accessCount: 'accessCount + 1', lastAccessedAt: `'${escapeSql(timestamp)}'` },
    where: `id IN (${escapedList})`,
  });
}

export async function pinSemanticMemory(id: string, pinned: boolean): Promise<ServiceResult<void>> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);

  await table.update({ valuesSql: { pinned: pinned ? '1' : '0' }, where: `id = '${escapeSql(id)}'` });
  log.info({ id, pinned }, 'updated memory pin status');
  return ok(undefined);
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

export async function pruneStaleMemories(config: {
  maxMemories: number;
  staleDays: number;
}): Promise<ServiceResult<void>> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);

  const rows = await table.query().toArray();
  const count = rows.length;
  if (count === 0) return ok(undefined);

  // Calculate value score for each memory
  const scored = rows.map((r) => {
    const accessCount = r.accessCount as number;
    const lastAccessedAt = r.lastAccessedAt as string;
    const confidence = r.confidence as string;
    const pinned = (r.pinned as number) === 1;

    const daysSince = (Date.now() - Date.parse(lastAccessedAt)) / (1000 * 60 * 60 * 24);

    const value =
      accessCount * 0.3 +
      getRecencyFactor(lastAccessedAt) * 0.3 +
      getConfidenceFactor(confidence) * 0.2 +
      (pinned ? 1.0 : 0) * 0.2;

    return { id: r.id as string, value, pinned, daysSince, accessCount };
  });

  // Sort ascending by value (lowest value first)
  scored.sort((a, b) => a.value - b.value);

  const toDelete = new Set<string>();

  // First, delete any unpinned memory that is stale AND never accessed
  for (const item of scored) {
    if (!item.pinned && item.daysSince > config.staleDays && item.accessCount === 0) {
      toDelete.add(item.id);
    }
  }

  // Second, if still over the cap, delete lowest value memories until under
  let currentTotal = count - toDelete.size;
  if (currentTotal > config.maxMemories) {
    for (const item of scored) {
      if (currentTotal <= config.maxMemories) break;
      if (!item.pinned && !toDelete.has(item.id)) {
        toDelete.add(item.id);
        currentTotal--;
      }
    }
  }

  if (toDelete.size > 0) {
    const escapedList = Array.from(toDelete)
      .map((id) => `'${escapeSql(id)}'`)
      .join(', ');
    await table.delete(`id IN (${escapedList})`);
    log.info({ count: toDelete.size, totalWas: count, cap: config.maxMemories }, 'pruned low-value/stale memories');
  }

  return ok(undefined);
}

export async function deduplicateMemories(similarityThreshold = 0.85): Promise<number> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);

  const rows = await table.query().toArray();
  if (rows.length < 2) return 0;

  const toDelete = new Set<string>();

  for (const row of rows) {
    const id = row.id as string;
    if (toDelete.has(id)) continue;

    const vector = row.vector as number[];
    const results = await (table.search(vector) as VectorQuery).distanceType('cosine').limit(4).toArray();

    for (const neighbor of results) {
      const neighborId = neighbor.id as string;
      if (neighborId === id || toDelete.has(neighborId)) continue;

      const similarity = 1 - (neighbor._distance as number);
      if (similarity < similarityThreshold) continue;

      // Keep the higher-value memory, delete the lower-value one
      const rowValue = computeMemoryValue(row);
      const neighborValue = computeMemoryValue(neighbor);

      if (neighborValue < rowValue) {
        toDelete.add(neighborId);
      } else {
        toDelete.add(id);
        break; // current row is being deleted, stop checking its neighbors
      }
    }
  }

  if (toDelete.size > 0) {
    const escapedList = Array.from(toDelete)
      .map((id) => `'${escapeSql(id)}'`)
      .join(', ');
    await table.delete(`id IN (${escapedList})`);
    log.info({ count: toDelete.size, threshold: similarityThreshold }, 'dedup sweep removed near-duplicate memories');
  }

  return toDelete.size;
}

function computeMemoryValue(r: Record<string, unknown>): number {
  const accessCount = r.accessCount as number;
  const lastAccessedAt = r.lastAccessedAt as string;
  const confidence = r.confidence as string;
  const pinned = (r.pinned as number) === 1;

  return (
    accessCount * 0.3 +
    getRecencyFactor(lastAccessedAt) * 0.3 +
    getConfidenceFactor(confidence) * 0.2 +
    (pinned ? 1.0 : 0) * 0.2
  );
}

export async function getMemoryStats(): Promise<ServiceResult<MemoryStats>> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);

  const rows = await table.query().toArray();
  const stats: MemoryStats = {
    total: rows.length,
    pinned: 0,
    stale: 0,
    byCategory: {},
    byConfidence: {},
    avgAccessCount: 0,
    oldestCreatedAt: null,
    newestCreatedAt: null,
  };

  if (rows.length === 0) return ok(stats);

  let totalAccesses = 0;
  let oldest = Number.MAX_VALUE;
  let newest = 0;

  for (const r of rows) {
    const pinned = (r.pinned as number) === 1;
    const category = r.category as string;
    const confidence = r.confidence as string;
    const accessCount = r.accessCount as number;
    const createdAtMs = Date.parse(r.createdAt as string);
    const lastAccessedMs = Date.parse(r.lastAccessedAt as string);

    if (pinned) stats.pinned++;

    const daysSinceAccess = (Date.now() - lastAccessedMs) / (1000 * 60 * 60 * 24);
    if (daysSinceAccess > 60 && accessCount === 0) stats.stale++; // Hardcoded 60 days for stat reporting

    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    stats.byConfidence[confidence] = (stats.byConfidence[confidence] || 0) + 1;

    totalAccesses += accessCount;
    if (createdAtMs < oldest) oldest = createdAtMs;
    if (createdAtMs > newest) newest = createdAtMs;
  }

  stats.avgAccessCount = totalAccesses / rows.length;
  stats.oldestCreatedAt = oldest !== Number.MAX_VALUE ? new Date(oldest).toISOString() : null;
  stats.newestCreatedAt = newest !== 0 ? new Date(newest).toISOString() : null;

  return ok(stats);
}
