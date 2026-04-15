import { randomUUID } from 'node:crypto';

import * as Log from '@/lib/log.js';
import type { MemoryEmbedder } from '@/memory/embedding/embedder.js';
import { createEmbedder } from '@/memory/embedding/factory.js';
import { getSemanticTable } from '@/memory/store/tables.js';
import type {
  ListSemanticMemoriesResponse,
  SearchSemanticMemoriesResponse,
  MemoryCategory,
  SemanticMemory,
  MemorySource,
  ExtractedFact,
} from '@/memory/types.js';
import type { VectorQuery } from '@lancedb/lancedb';
import { err, ok, type ServiceResult } from '@/lib/service-result.js';

const log = Log.create({ service: 'memory-service' });
const MAX_SEARCH_RESULTS = 1000;

function now(): string {
  return new Date().toISOString();
}

async function getEmbedder(): Promise<MemoryEmbedder> {
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
): Promise<ServiceResult<SemanticMemory>> {
  try {
    const embedder = await getEmbedder();
    const [vector, table] = await Promise.all([
      embedder.embed(fact.content),
      getSemanticTable(embedder.dimensions),
    ]);
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
      vector,
    };

    await table.add([record]);
    log.info({ id, category: fact.category }, 'added semantic memory');

    const { vector: _, pinned, ...rest } = record;
    return ok({ ...rest, pinned: pinned === 1 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to add semantic memory';
    log.error({ error: message }, 'failed to add semantic memory');
    return err(message, 500);
  }
}

type SemanticMemoryUpdate = {
  content?: string;
  category?: SemanticMemory['category'];
  confidence?: SemanticMemory['confidence'];
};

export async function updateSemanticMemory(
  id: string,
  updates: SemanticMemoryUpdate,
): Promise<ServiceResult<undefined>> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);
  const timestamp = now();

  const columns: Record<string, string> = {
    updatedAt: `'${escapeSql(timestamp)}'`,
  };
  if (updates.category !== undefined) {
    columns.category = `'${escapeSql(updates.category)}'`;
  }
  if (updates.confidence !== undefined) {
    columns.confidence = `'${escapeSql(updates.confidence)}'`;
  }

  if (updates.content !== undefined) {
    const vector = await embedder.embed(updates.content);

    const existing = await table
      .query()
      .where(`id = '${escapeSql(id)}'`)
      .toArray();
    if (existing.length === 0) {
      log.warn({ id }, 'semantic memory not found for update');
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
      vector,
    };

    await table.delete(`id = '${escapeSql(id)}'`);
    await table.add([newRecord]);
  } else {
    await table.update({ valuesSql: columns, where: `id = '${escapeSql(id)}'` });
  }

  log.info({ id }, 'updated semantic memory');
  return ok(undefined);
}

export async function deleteSemanticMemory(id: string): Promise<ServiceResult<undefined>> {
  try {
    const embedder = await getEmbedder();
    const table = await getSemanticTable(embedder.dimensions);
    await table.delete(`id = '${escapeSql(id)}'`);
    log.info({ id }, 'deleted semantic memory');
    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete semantic memory';
    log.error({ error: message }, 'failed to delete semantic memory');
    return err(message, 500);
  }
}

export async function deleteSemanticMemories(ids: string[]): Promise<ServiceResult<undefined>> {
  if (ids.length === 0) return ok(undefined);

  try {
    const embedder = await getEmbedder();
    const table = await getSemanticTable(embedder.dimensions);

    const escapedList = ids.map((id) => `'${escapeSql(id)}'`).join(', ');
    await table.delete(`id IN (${escapedList})`);
    log.info({ count: ids.length }, 'bulk deleted semantic memories');
    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete semantic memories';
    log.error({ error: message }, 'failed to delete semantic memories');
    return err(message, 500);
  }
}

export async function searchSemanticMemories(input: {
  query: string;
  page: number;
  pageSize: number;
  sourceFilter?: MemorySource;
  categoryFilter?: MemoryCategory;
}): Promise<ServiceResult<SearchSemanticMemoriesResponse>> {
  try {
    const embedder = await getEmbedder();
    const table = await getSemanticTable(embedder.dimensions);

    const [count, vector] = await Promise.all([table.countRows(), embedder.embed(input.query)]);
    if (count === 0) {
      return ok({
        memories: [],
        page: input.page,
        pageSize: input.pageSize,
        total: 0,
        totalPages: 0,
      });
    }

    let search = (table.search(vector) as VectorQuery)
      .distanceType('cosine')
      .limit(MAX_SEARCH_RESULTS);

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
    const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);

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
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to search semantic memories';
    log.error({ error: message }, 'failed to search semantic memories');
    return err(message, 500);
  }
}

export async function getAllSemanticMemories(input: {
  page: number;
  pageSize: number;
  sourceFilter?: MemorySource;
  categoryFilter?: MemoryCategory;
}): Promise<ServiceResult<ListSemanticMemoriesResponse>> {
  try {
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
    const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);

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
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list semantic memories';
    log.error({ error: message }, 'failed to list semantic memories');
    return err(message, 500);
  }
}

export async function touchSemanticMemories(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);
  const timestamp = now();

  const escapedList = ids.map((id) => `'${escapeSql(id)}'`).join(', ');
  await table.update({
    valuesSql: {
      accessCount: 'accessCount + 1',
      lastAccessedAt: `'${escapeSql(timestamp)}'`,
    },
    where: `id IN (${escapedList})`,
  });
}

export async function pinSemanticMemory(id: string, pinned: boolean): Promise<ServiceResult<undefined>> {
  try {
    const embedder = await getEmbedder();
    const table = await getSemanticTable(embedder.dimensions);

    await table.update({
      valuesSql: {
        pinned: pinned ? '1' : '0',
      },
      where: `id = '${escapeSql(id)}'`,
    });
    log.info({ id, pinned }, 'updated memory pin status');
    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to pin semantic memory';
    log.error({ error: message }, 'failed to pin semantic memory');
    return err(message, 500);
  }
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

export async function pruneStaleMemories(config: { maxMemories: number; staleDays: number }): Promise<ServiceResult<undefined>> {
  try {
    const embedder = await getEmbedder();
    const table = await getSemanticTable(embedder.dimensions);

    const count = await table.countRows();
    if (count <= config.maxMemories) return ok(undefined);

    const rows = await table.query().toArray();

    const scored = rows.map(r => {
      const accessCount = r.accessCount as number;
      const lastAccessedAt = r.lastAccessedAt as string;
      const confidence = r.confidence as string;
      const pinned = (r.pinned as number) === 1;

      const daysSince = (Date.now() - Date.parse(lastAccessedAt)) / (1000 * 60 * 60 * 24);

      const value =
        (accessCount * 0.3) +
        (getRecencyFactor(lastAccessedAt) * 0.3) +
        (getConfidenceFactor(confidence) * 0.2) +
        (pinned ? 1.0 : 0) * 0.2;

      return { id: r.id as string, value, pinned, daysSince, accessCount };
    });

    scored.sort((a, b) => a.value - b.value);

    const toDelete = new Set<string>();

    let currentTotal = count;
    for (const item of scored) {
      if (currentTotal <= config.maxMemories) break;
      if (!item.pinned) {
        toDelete.add(item.id);
        currentTotal--;
      }
    }

    for (const item of scored) {
      if (!item.pinned && !toDelete.has(item.id) && item.daysSince > config.staleDays && item.accessCount === 0) {
        toDelete.add(item.id);
      }
    }

    if (toDelete.size > 0) {
      const escapedList = Array.from(toDelete).map((id) => `'${escapeSql(id)}'`).join(', ');
      await table.delete(`id IN (${escapedList})`);
      log.info({ count: toDelete.size, totalWas: count, cap: config.maxMemories }, 'pruned low-value/stale memories');
    }
    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to prune stale memories';
    log.error({ error: message }, 'failed to prune stale memories');
    return err(message, 500);
  }
}

export async function deduplicateMemories(similarityThreshold = 0.92): Promise<number> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);

  const rows = await table.query().toArray();
  if (rows.length < 2) return 0;

  const toDelete = new Set<string>();

  for (const row of rows) {
    const id = row.id as string;
    if (toDelete.has(id)) continue;

    const vector = row.vector as number[];
    const results = await (table.search(vector) as VectorQuery)
      .distanceType('cosine')
      .limit(4)
      .toArray();

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

export async function getMemoryStats(): Promise<ServiceResult<any>> {
  try {
    const embedder = await getEmbedder();
    const table = await getSemanticTable(embedder.dimensions);

    const rows = await table.query().toArray();
    const stats = {
      total: rows.length,
      pinned: 0,
      stale: 0,
      byCategory: {} as Record<string, number>,
      byConfidence: {} as Record<string, number>,
      avgAccessCount: 0,
      oldestCreatedAt: null as string | null,
      newestCreatedAt: null as string | null,
    };

    if (rows.length > 0) {
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
        if (daysSinceAccess > 60 && accessCount === 0) stats.stale++;

        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
        stats.byConfidence[confidence] = (stats.byConfidence[confidence] || 0) + 1;

        totalAccesses += accessCount;
        if (createdAtMs < oldest) oldest = createdAtMs;
        if (createdAtMs > newest) newest = createdAtMs;
      }

      stats.avgAccessCount = totalAccesses / rows.length;
      stats.oldestCreatedAt = oldest !== Number.MAX_VALUE ? new Date(oldest).toISOString() : null;
      stats.newestCreatedAt = newest !== 0 ? new Date(newest).toISOString() : null;
    }

    return ok(stats);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to get memory stats';
    log.error({ error: message }, 'failed to get memory stats');
    return err(message, 500);
  }
}
