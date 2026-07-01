import { describe, expect, mock, test } from 'bun:test';

import type { Table as LanceTable } from '@lancedb/lancedb';

describe('getSemanticTable', () => {
  test('shares one table creation across concurrent callers', async () => {
    const table = { name: 'semantic_memories' } as unknown as LanceTable;
    const calls = { tableNames: 0, createEmptyTable: 0 };

    void mock.module('@/memory/store/connection.js', () => ({
      getConnection: async () => ({
        tableNames: async () => {
          calls.tableNames++;
          return [];
        },
        createEmptyTable: async () => {
          calls.createEmptyTable++;
          return table;
        },
      }),
    }));

    const { getSemanticTable } = await import('@/memory/store/tables.js');

    const [first, second] = await Promise.all([getSemanticTable(1536), getSemanticTable(1536)]);

    expect(first).toBe(table);
    expect(second).toBe(table);
    expect(calls.tableNames).toBe(1);
    expect(calls.createEmptyTable).toBe(1);
  });
});
