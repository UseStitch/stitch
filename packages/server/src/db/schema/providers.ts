import { blob, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { LocalModel } from '@stitch/shared/providers/types';

import type { ProviderCredentials } from '@/provider/config/schema.js';

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
    provider: text('provider').$type<LocalModel['provider']>().notNull(),
    id: text('id').$type<LocalModel['id']>().notNull(),
    name: text('name').$type<LocalModel['name']>().notNull(),
    contextWindow: integer('context_window').$type<LocalModel['contextWindow']>().notNull().default(8192),
    inputLimit: integer('input_limit').$type<LocalModel['inputLimit']>(),
    outputLimit: integer('output_limit').$type<LocalModel['outputLimit']>().notNull().default(8192),
    inputCostPerMillion: real('input_cost_per_million').$type<LocalModel['inputCostPerMillion']>().notNull().default(0),
    outputCostPerMillion: real('output_cost_per_million')
      .$type<LocalModel['outputCostPerMillion']>()
      .notNull()
      .default(0),
    cacheReadCostPerMillion: real('cache_read_cost_per_million').$type<LocalModel['cacheReadCostPerMillion']>(),
    cacheWriteCostPerMillion: real('cache_write_cost_per_million').$type<LocalModel['cacheWriteCostPerMillion']>(),
    supportsToolCalls: integer('supports_tool_calls', { mode: 'boolean' })
      .$type<LocalModel['supportsToolCalls']>()
      .notNull()
      .default(false),
    supportsVision: integer('supports_vision', { mode: 'boolean' })
      .$type<LocalModel['supportsVision']>()
      .notNull()
      .default(false),
    supportsReasoning: integer('supports_reasoning', { mode: 'boolean' })
      .$type<LocalModel['supportsReasoning']>()
      .notNull()
      .default(false),
    inputModalities: blob('input_modalities', { mode: 'json' })
      .$type<LocalModel['inputModalities']>()
      .notNull()
      .default(['text']),
    outputModalities: blob('output_modalities', { mode: 'json' })
      .$type<LocalModel['outputModalities']>()
      .notNull()
      .default(['text']),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .$type<LocalModel['createdAt']>()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .$type<LocalModel['updatedAt']>()
      .$defaultFn(() => Date.now()),
  },
  (table) => [primaryKey({ columns: [table.provider, table.id] })],
);
