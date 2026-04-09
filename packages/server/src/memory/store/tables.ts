import { Field, FixedSizeList, Float32, Int32, Schema, Utf8 } from 'apache-arrow';

import * as Log from '@/lib/log.js';
import { getConnection } from '@/memory/store/connection.js';
import type { Table as LanceTable } from '@lancedb/lancedb';

const log = Log.create({ service: 'memory-tables' });

const SEMANTIC_TABLE = 'semantic_memories';

let cachedTable: LanceTable | null = null;

function semanticSchema(dimensions: number): Schema {
  return new Schema([
    new Field('id', new Utf8(), false),
    new Field('content', new Utf8(), false),
    new Field('category', new Utf8(), false),
    new Field('confidence', new Utf8(), false),
    new Field('source', new Utf8(), false),
    new Field('sourceId', new Utf8(), false),
    new Field('createdAt', new Utf8(), false),
    new Field('updatedAt', new Utf8(), false),
    new Field('accessCount', new Int32(), false),
    new Field('lastAccessedAt', new Utf8(), false),
    new Field('vector', new FixedSizeList(dimensions, new Field('item', new Float32())), false),
  ]);
}

export async function getSemanticTable(dimensions: number): Promise<LanceTable> {
  if (cachedTable) return cachedTable;

  const db = await getConnection();
  const names = await db.tableNames();

  if (names.includes(SEMANTIC_TABLE)) {
    cachedTable = await db.openTable(SEMANTIC_TABLE);
  } else {
    log.info({ dimensions }, 'creating semantic_memories table');
    cachedTable = await db.createEmptyTable(SEMANTIC_TABLE, semanticSchema(dimensions));
  }

  return cachedTable;
}

export async function dropSemanticTable(): Promise<void> {
  const db = await getConnection();
  const names = await db.tableNames();
  if (names.includes(SEMANTIC_TABLE)) {
    await db.dropTable(SEMANTIC_TABLE);
    cachedTable = null;
    log.info('dropped semantic_memories table');
  }
}
