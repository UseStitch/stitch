import type { LanceMigrationDefinition } from '@/db/lance-migrations/types.js';

export const migration0001AddPinnedColumn: LanceMigrationDefinition = {
  id: 'c0e2cb95-fb7c-4f4f-84af-81863f8fe31e',
  prevId: null,
  version: 1,
  name: 'add_pinned_column',
  checksum: 'sha256:a2192b6f41efd198f4c7dd6f4f2e4f62995d2085ca163e254a497c7f9f980548',
  tableName: 'semantic_memories',
  isApplied: async (table) => {
    const schema = await table.schema();
    return schema.fields.some((field) => field.name === 'pinned');
  },
  up: async (table) => {
    await table.addColumns([{ name: 'pinned', valueSql: '0' }]);
  },
};
