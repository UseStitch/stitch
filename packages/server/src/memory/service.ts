import { randomUUID } from 'node:crypto';

import type { VectorQuery } from '@lancedb/lancedb';

import type { MemoryEmbedder } from '@/memory/embedding/embedder.js';
import { createEmbedder } from '@/memory/embedding/factory.js';
import { getSemanticTable } from '@/memory/store/tables.js';
import type {
  SemanticMemory,
  MemorySearchResult,
  MemorySource,
  ExtractedFact,
} from '@/memory/types.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'memory-service' });

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
): Promise<SemanticMemory> {
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
    vector,
  };

  await table.add([record]);
  log.info({ id, category: fact.category }, 'added semantic memory');

  const { vector: _, ...rest } = record;
  return rest;
}

type SemanticMemoryUpdate = {
  content?: string;
  category?: SemanticMemory['category'];
  confidence?: SemanticMemory['confidence'];
};

export async function updateSemanticMemory(
  id: string,
  updates: SemanticMemoryUpdate,
): Promise<void> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);
  const timestamp = now();

  // LanceDB update uses SQL-style expressions for new values.
  // For vector + metadata updates, delete-then-insert is the pragmatic approach.
  const existing = await table
    .query()
    .where(`id = '${escapeSql(id)}'`)
    .toArray();

  if (existing.length === 0) {
    log.warn({ id }, 'semantic memory not found for update');
    return;
  }

  const row = existing[0];
  const newContent = updates.content ?? (row.content as string);
  const vector =
    updates.content !== undefined ? await embedder.embed(newContent) : row.vector;

  await table.delete(`id = '${escapeSql(id)}'`);
  await table.add([
    {
      ...row,
      content: newContent,
      category: updates.category ?? row.category,
      confidence: updates.confidence ?? row.confidence,
      updatedAt: timestamp,
      vector,
    },
  ]);

  log.info({ id }, 'updated semantic memory');
}

export async function deleteSemanticMemory(id: string): Promise<void> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);
  await table.delete(`id = '${escapeSql(id)}'`);
  log.info({ id }, 'deleted semantic memory');
}

export async function deleteSemanticMemories(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);

  const escapedList = ids.map((id) => `'${escapeSql(id)}'`).join(', ');
  await table.delete(`id IN (${escapedList})`);
  log.info({ count: ids.length }, 'bulk deleted semantic memories');
}

export async function searchSemanticMemories(
  query: string,
  limit = 10,
  sourceFilter?: MemorySource,
): Promise<MemorySearchResult[]> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);

  const [count, vector] = await Promise.all([
    table.countRows(),
    embedder.embed(query),
  ]);
  if (count === 0) return [];

  let search = (table.search(vector) as VectorQuery)
    .distanceType('cosine')
    .limit(limit);

  if (sourceFilter) {
    search = search.where(`source = '${escapeSql(sourceFilter)}'`);
  }

  const results = await search.toArray();

  return results.map((r: Record<string, unknown>) => ({
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
    score: 1 - (r._distance as number),
  }));
}

export async function getAllSemanticMemories(sourceFilter?: MemorySource): Promise<SemanticMemory[]> {
  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);

  let query = table.query();
  if (sourceFilter) {
    query = query.where(`source = '${escapeSql(sourceFilter)}'`);
  }

  const rows = await query.toArray();

  return rows.map((r) => ({
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
  }));
}

export async function touchSemanticMemories(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const embedder = await getEmbedder();
  const table = await getSemanticTable(embedder.dimensions);
  const timestamp = now();

  const escapedList = ids.map((id) => `'${escapeSql(id)}'`).join(', ');
  const rows = await table.query().where(`id IN (${escapedList})`).toArray();
  if (rows.length === 0) return;

  const updated = rows.map((row) => ({
    ...row,
    accessCount: (row.accessCount as number) + 1,
    lastAccessedAt: timestamp,
  }));

  await table.delete(`id IN (${escapedList})`);
  await table.add(updated);
}
