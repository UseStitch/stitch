import type { PrefixedString } from '@stitch/shared/id';
import type { ToolType } from '@stitch/shared/tools/types';

import { isDbInitialized } from '@/db/client.js';
import { isServiceError } from '@/lib/service-result.js';
import { listEnabledProviderEmbeddingModels } from '@/llm/provider/service.js';
import { getMemoryConfig, hasConfiguredEmbeddingModel } from '@/memory/config.js';
import {
  createRegisteredTool as createBashRegisteredTool,
  DISPLAY_NAME as BASH_DISPLAY_NAME,
} from '@/tools/core/bash.js';
import {
  createRegisteredTool as createEditRegisteredTool,
  DISPLAY_NAME as EDIT_DISPLAY_NAME,
} from '@/tools/core/edit.js';
import {
  createRegisteredTool as createGlobRegisteredTool,
  DISPLAY_NAME as GLOB_DISPLAY_NAME,
} from '@/tools/core/glob.js';
import {
  createRegisteredTool as createGrepRegisteredTool,
  DISPLAY_NAME as GREP_DISPLAY_NAME,
} from '@/tools/core/grep.js';
import {
  createRegisteredTool as createMemoryRegisteredTool,
  DISPLAY_NAME as MEMORY_DISPLAY_NAME,
} from '@/tools/core/memory.js';
import {
  createRegisteredTool as createQuestionRegisteredTool,
  DISPLAY_NAME as QUESTION_DISPLAY_NAME,
} from '@/tools/core/question.js';
import {
  createRegisteredTool as createReadRegisteredTool,
  DISPLAY_NAME as READ_DISPLAY_NAME,
} from '@/tools/core/read.js';
import {
  createRegisteredTool as createTodoRegisteredTool,
  DISPLAY_NAME as TODO_DISPLAY_NAME,
} from '@/tools/core/todo.js';
import {
  createRegisteredTool as createWebfetchRegisteredTool,
  DISPLAY_NAME as WEBFETCH_DISPLAY_NAME,
} from '@/tools/core/webfetch.js';
import {
  createRegisteredTool as createWriteRegisteredTool,
  DISPLAY_NAME as WRITE_DISPLAY_NAME,
} from '@/tools/core/write.js';
import { getDisabledToolIdentifiers } from '@/tools/enabled-service.js';
import { withToolResultHandlingRecord } from '@/tools/runtime/wrappers.js';

export const MAX_STEPS = 25;

export const MAX_STEPS_WARNING = (max: number) =>
  `CRITICAL - FINAL STEP ${max}/${max}\n\nThis is the last allowed step for this run.\n\nSTRICT REQUIREMENTS:\n1. Do NOT call any tools.\n2. MUST provide a user-facing text response summarizing work done so far.\n3. If anything is incomplete, clearly list what remains and what to do next.\n4. This overrides all other instructions that suggest additional tool use.`;

type KnownTool = { toolType: ToolType; toolName: string; displayName: string };

const STITCH_TOOL_MODULES = {
  webfetch: {
    displayName: WEBFETCH_DISPLAY_NAME,
    createRegisteredTool: createWebfetchRegisteredTool,
  },
  question: {
    displayName: QUESTION_DISPLAY_NAME,
    createRegisteredTool: createQuestionRegisteredTool,
  },
  read: {
    displayName: READ_DISPLAY_NAME,
    createRegisteredTool: createReadRegisteredTool,
  },
  bash: {
    displayName: BASH_DISPLAY_NAME,
    createRegisteredTool: createBashRegisteredTool,
  },
  glob: {
    displayName: GLOB_DISPLAY_NAME,
    createRegisteredTool: createGlobRegisteredTool,
  },
  grep: {
    displayName: GREP_DISPLAY_NAME,
    createRegisteredTool: createGrepRegisteredTool,
  },
  edit: {
    displayName: EDIT_DISPLAY_NAME,
    createRegisteredTool: createEditRegisteredTool,
  },
  write: {
    displayName: WRITE_DISPLAY_NAME,
    createRegisteredTool: createWriteRegisteredTool,
  },
  memory: {
    displayName: MEMORY_DISPLAY_NAME,
    createRegisteredTool: createMemoryRegisteredTool,
  },
  todo: {
    displayName: TODO_DISPLAY_NAME,
    createRegisteredTool: createTodoRegisteredTool,
  },
} as const;

export const STITCH_KNOWN_TOOLS: KnownTool[] = Object.entries(STITCH_TOOL_MODULES).map(
  ([name, mod]) => ({
    toolType: 'stitch',
    toolName: name,
    displayName: mod.displayName,
  }),
);

export async function createTools(context: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
}) {
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

  const toolEntries = Object.entries(STITCH_TOOL_MODULES).filter(([name]) => {
    if (name !== 'memory') return true;
    return shouldEnableMemoryTool;
  });

  const disabledTools = await getDisabledToolIdentifiers('tool');
  const enabledToolEntries = toolEntries.filter(([name]) => !disabledTools.has(name));

  return withToolResultHandlingRecord(
    Object.fromEntries(
      enabledToolEntries.map(([name, mod]) => [name, mod.createRegisteredTool(context)]),
    ),
  );
}
