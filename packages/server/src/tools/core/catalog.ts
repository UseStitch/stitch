import { isDbInitialized } from '@/db/client.js';
import { listEnabledProviderEmbeddingModels } from '@/llm/provider/service.js';
import { getMemoryConfig, hasConfiguredEmbeddingModel } from '@/memory/config.js';
import { definition as bash } from '@/tools/core/bash.js';
import { definition as createSkill } from '@/tools/core/create-skill.js';
import { definition as edit } from '@/tools/core/edit.js';
import { definition as glob } from '@/tools/core/glob.js';
import { definition as grep } from '@/tools/core/grep.js';
import { createDefinition as createMemoryDefinition } from '@/tools/core/memory.js';
import { createDefinition as createQuestionDefinition } from '@/tools/core/question.js';
import { definition as read } from '@/tools/core/read.js';
import { definition as renderUi } from '@/tools/core/render-ui.js';
import { definition as skill } from '@/tools/core/skill.js';
import { createDefinition as createTodoDefinition } from '@/tools/core/todo.js';
import { definition as webfetch } from '@/tools/core/webfetch.js';
import { definition as write } from '@/tools/core/write.js';
import type { ToolDefinition } from '@/tools/runtime/pipeline.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

export type CatalogEntry =
  | { kind: 'static'; definition: ToolDefinition }
  | {
      kind: 'contextual';
      name: string;
      displayName: string;
      create: (context: ToolContext) => ToolDefinition;
      /** If provided, called at assembly time to decide whether to include this tool. */
      enabled?: () => Promise<boolean> | boolean;
    };

export function entryMeta(entry: CatalogEntry): { name: string; displayName: string } {
  if (entry.kind === 'static') {
    return { name: entry.definition.name, displayName: entry.definition.displayName };
  }
  return { name: entry.name, displayName: entry.displayName };
}

export const CORE_TOOL_CATALOG: CatalogEntry[] = [
  { kind: 'static', definition: webfetch },
  { kind: 'static', definition: read },
  { kind: 'static', definition: bash },
  { kind: 'static', definition: glob },
  { kind: 'static', definition: grep },
  { kind: 'static', definition: edit },
  { kind: 'static', definition: write },
  { kind: 'static', definition: renderUi },
  { kind: 'static', definition: skill },
  { kind: 'static', definition: createSkill },
  { kind: 'contextual', name: 'question', displayName: 'Question', create: createQuestionDefinition },
  { kind: 'contextual', name: 'todo', displayName: 'Todo', create: createTodoDefinition },
  {
    kind: 'contextual',
    name: 'memory',
    displayName: 'Memory',
    create: createMemoryDefinition,
    enabled: async () => {
      if (!isDbInitialized()) return false;
      const memoryConfig = await getMemoryConfig();
      if (!hasConfiguredEmbeddingModel(memoryConfig)) return false;
      const result = await listEnabledProviderEmbeddingModels();
      const providers = result.error ? [] : result.data;
      return providers.some(
        (provider) =>
          provider.providerId === memoryConfig.embeddingProviderId &&
          provider.models.some((model) => model.id === memoryConfig.embeddingModelId),
      );
    },
  },
];
