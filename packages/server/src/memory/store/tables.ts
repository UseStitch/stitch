import type { Table as LanceTable } from '@lancedb/lancedb';
import {
  Field,
  FixedSizeList,
  Float32,
  Int32,
  Schema,
  Utf8,
} from 'apache-arrow';

import { getConnection } from '@/memory/store/connection.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'memory-tables' });

const SEMANTIC_TABLE = 'semantic_memories';

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
    new Field(
      'vector',
      new FixedSizeList(dimensions, new Field('item', new Float32())),
      false,
    ),
  ]);
}


async function tableExists(name: string): Promise<boolean> {
  const db = await getConnection();
  const names = await db.tableNames();
  return names.includes(name);
}

export async function getSemanticTable(dimensions: number): Promise<LanceTable> {
  const db = await getConnection();
  if (await tableExists(SEMANTIC_TABLE)) {
    return db.openTable(SEMANTIC_TABLE);
  }

  log.info({ dimensions }, 'creating semantic_memories table');
  return db.createEmptyTable(SEMANTIC_TABLE, semanticSchema(dimensions));
}


