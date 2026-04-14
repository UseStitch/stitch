import type { Table as LanceTable } from '@lancedb/lancedb';

export type LanceMigrationDefinition = {
  id: string;
  prevId: string | null;
  version: number;
  name: string;
  checksum: string;
  tableName: string;
  isApplied?: (table: LanceTable) => Promise<boolean>;
  up: (table: LanceTable) => Promise<void>;
};
