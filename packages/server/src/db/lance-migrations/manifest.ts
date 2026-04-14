import { migration0001AddPinnedColumn } from '@/db/lance-migrations/0001-add-pinned-column.js';
import type { LanceMigrationDefinition } from '@/db/lance-migrations/types.js';

export const MIGRATIONS: LanceMigrationDefinition[] = [migration0001AddPinnedColumn];
