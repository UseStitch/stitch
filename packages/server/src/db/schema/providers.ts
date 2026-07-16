import { blob, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { LocalProviderId } from '@stitch/shared/providers/types';

import type { RawModel } from '@/models/llm/registry.js';
import type { ProviderCredentials } from '@/provider/config/schema.js';

export type { LocalProviderId } from '@stitch/shared/providers/types';
type LocalModality = NonNullable<RawModel['modalities']>['input'][number];

export const providerConfig = sqliteTable('provider_config', {
  providerId: text('provider_id').primaryKey(),
  credentials: blob('credentials', { mode: 'json' }).$type<ProviderCredentials>().notNull(),
  createdAt: integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const modelVisibility = sqliteTable(
  'model_visibility',
  {
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    visibility: text('visibility').$type<'show' | 'hide'>().notNull(),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [uniqueIndex('model_visibility_provider_model_idx').on(table.providerId, table.modelId)],
);

export const localModels = sqliteTable(
  'local_models',
  {
    provider: text('provider').$type<LocalProviderId>().notNull(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    contextWindow: integer('context_window').notNull().default(8192),
    inputLimit: integer('input_limit'),
    outputLimit: integer('output_limit').notNull().default(8192),
    inputCostPerMillion: real('input_cost_per_million').notNull().default(0),
    outputCostPerMillion: real('output_cost_per_million').notNull().default(0),
    cacheReadCostPerMillion: real('cache_read_cost_per_million'),
    cacheWriteCostPerMillion: real('cache_write_cost_per_million'),
    supportsToolCalls: integer('supports_tool_calls', { mode: 'boolean' }).notNull().default(false),
    supportsVision: integer('supports_vision', { mode: 'boolean' }).notNull().default(false),
    supportsReasoning: integer('supports_reasoning', { mode: 'boolean' }).notNull().default(false),
    inputModalities: blob('input_modalities', { mode: 'json' }).$type<LocalModality[]>().notNull().default(['text']),
    outputModalities: blob('output_modalities', { mode: 'json' }).$type<LocalModality[]>().notNull().default(['text']),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [primaryKey({ columns: [table.provider, table.id] })],
);
