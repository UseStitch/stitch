import type { ToolType } from '@stitch/shared/tools/types';

import { isDbInitialized } from '@/db/client.js';
import { isServiceError } from '@/lib/service-result.js';
import { listEnabledProviderEmbeddingModels } from '@/llm/provider/service.js';
import { getMemoryConfig, hasConfiguredEmbeddingModel } from '@/memory/config.js';
import { definition as bash } from '@/tools/core/bash.js';
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
import { getDisabledToolIdentifiers } from '@/tools/enabled-service.js';
import { ToolPipeline, type ToolDefinition } from '@/tools/runtime/pipeline.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

export const MAX_STEPS = 25;

export const MAX_STEPS_WARNING = (max: number) =>
  `CRITICAL - FINAL STEP ${max}/${max}\n\nThis is the last allowed step for this run.\n\nSTRICT REQUIREMENTS:\n1. Do NOT call any tools.\n2. MUST provide a user-facing text response summarizing work done so far.\n3. If anything is incomplete, clearly list what remains and what to do next.\n4. This overrides all other instructions that suggest additional tool use.`;

type KnownTool = { toolType: ToolType; toolName: string; displayName: string };

/** Static tool definitions that don't need context at definition time. */
const STATIC_DEFINITIONS: ToolDefinition[] = [webfetch, read, bash, glob, grep, edit, write];

/** Tools that are always active regardless of user disable settings. */
const ALWAYS_ACTIVE = new Set(['render_ui', 'skill']);

export const STITCH_KNOWN_TOOLS: KnownTool[] = [
  ...STATIC_DEFINITIONS,
  // Context-dependent tools also appear in the known tools list
  { name: 'question', displayName: 'Question' } as ToolDefinition,
  { name: 'memory', displayName: 'Memory' } as ToolDefinition,
  { name: 'todo', displayName: 'Todo' } as ToolDefinition,
].map((def) => ({
  toolType: 'stitch',
  toolName: def.name,
  displayName: def.displayName,
}));

export async function createTools(context: ToolContext) {
  let shouldEnableMemoryTool = false;
  if (isDbInitialized()) {
    const memoryConfig = await getMemoryConfig();
    if (hasConfiguredEmbeddingModel(memoryConfig)) {
      const embeddingProvidersResult = await listEnabledProviderEmbeddingModels();
      const embeddingProviders = isServiceError(embeddingProvidersResult)
        ? []
        : embeddingProvidersResult.data;
      shouldEnableMemoryTool = embeddingProviders.some(
        (provider) =>
          provider.providerId === memoryConfig.embeddingProviderId &&
          provider.models.some((model) => model.id === memoryConfig.embeddingModelId),
      );
    }
  }

  const contextDefs: ToolDefinition[] = [
    createQuestionDefinition(context),
    createTodoDefinition(context),
    renderUi,
    skill,
  ];

  if (shouldEnableMemoryTool) {
    contextDefs.push(createMemoryDefinition(context));
  }

  const allDefs = [...STATIC_DEFINITIONS, ...contextDefs];
  const disabledTools = await getDisabledToolIdentifiers('tool');
  const enabledDefs = allDefs.filter(
    (def) => ALWAYS_ACTIVE.has(def.name) || !disabledTools.has(def.name),
  );

  const pipeline = ToolPipeline.create(context);
  return pipeline.registerAll(enabledDefs);
}
