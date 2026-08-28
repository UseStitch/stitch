import type { PrefixedString } from '@stitch/shared/id';

import { createCodeModeTool } from '@/code-mode/tool.js';
import * as Log from '@/lib/log.js';
import {
  buildActiveToolsetInstructionsBlock,
  buildAvailableToolsetsPrompt,
  buildExpiredToolsetsPrompt as buildExpiredToolsetsPromptInternal,
  composeWithFragments,
} from '@/llm/prompt/assembly.js';
import {
  getCurrentSessionToolsetState,
  getSessionToolsetState,
  type SessionExpiredToolset,
} from '@/llm/stream/session-toolsets.js';
import type { LlmProviderCredentials } from '@/provider/config/schema.js';
import { buildSkillsSystemPrompt } from '@/skills/service.js';
import { createInspectImageTool } from '@/tools/core/inspect-image.js';
import { createTaskTool } from '@/tools/core/task.js';
import { createToolsetTools } from '@/tools/core/toolset-management.js';
import { wrapTool } from '@/tools/runtime/pipeline.js';
import { createTools } from '@/tools/runtime/registry.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import { ToolsetManager } from '@/tools/toolsets/manager.js';
import { getToolset } from '@/tools/toolsets/registry.js';
import type { ModelMessage, Tool } from 'ai';

const log = Log.create({ service: 'session-context' });

type SessionContextOptions = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  credentials: LlmProviderCredentials;
  modelId: string;
  abortSignal: AbortSignal;
  llmMessages: ModelMessage[];
  activeToolsetIds?: string[];
  allowTaskTool?: boolean;
  excludedToolsetIds?: string[];
};

type AssembledResult = { messages: ModelMessage[]; tools: Record<string, Tool>; toolsetManager: ToolsetManager };

export function buildExpiredToolsetsPrompt(expired: SessionExpiredToolset[]): string {
  return buildExpiredToolsetsPromptInternal(expired);
}

export async function assembleSessionContext(opts: SessionContextOptions): Promise<AssembledResult> {
  const toolContext: ToolContext = {
    sessionId: opts.sessionId,
    messageId: opts.messageId,
    streamRunId: opts.streamRunId,
  };

  const sessionState = getSessionToolsetState(opts.sessionId);
  const currentSessionState = getCurrentSessionToolsetState(sessionState, (toolsetId) => getToolNames(toolsetId));
  const activeEntries = opts.activeToolsetIds
    ? opts.activeToolsetIds.map((id) => ({ id, scope: 'until_deactivated' as const }))
    : currentSessionState.active;
  const expiredEntries = opts.activeToolsetIds ? [] : currentSessionState.expired;
  const expiredPrompt = opts.activeToolsetIds ? '' : buildExpiredToolsetsPromptInternal(expiredEntries);

  const toolsetManager = new ToolsetManager(toolContext, activeEntries, {
    excludedToolsetIds: opts.excludedToolsetIds,
  });
  await restoreToolsets(
    toolsetManager,
    activeEntries.map((entry) => entry.id),
  );

  const coreTools = await createTools(toolContext);
  const metaTools = buildToolsetMetaTools(toolContext, toolsetManager);
  const taskTool = buildTaskTool(toolContext, opts, toolsetManager);
  const inspectImageTool = buildInspectImageTool(toolContext, opts);
  const codeModeResult = createCodeModeTool({
    getTools: () =>
      mergeTools({
        staticTools: { ...coreTools, ...metaTools },
        taskTool,
        inspectImageTool,
        dynamicTools: toolsetManager.getActiveTools(),
      }),
    abortSignal: opts.abortSignal,
  });
  const toolsetsCatalog = await toolsetManager.getCatalogWithState({ includeTools: true });
  const toolsetsPrompt = buildAvailableToolsetsPrompt(toolsetsCatalog);
  const skillsPrompt = await buildSkillsSystemPrompt();

  const instructionsBlock = buildActiveToolsetInstructionsBlock(opts.sessionId);

  const messages = composeWithFragments(opts.llmMessages, [
    { layer: 'semiStatic', content: codeModeResult.getSystemPrompt() },
    { layer: 'semiStatic', content: expiredPrompt },
    { layer: 'semiStatic', content: toolsetsPrompt },
    { layer: 'semiStatic', content: skillsPrompt },
    { layer: 'dynamic', content: instructionsBlock },
  ]);

  const tools = {
    ...mergeTools({ staticTools: { ...coreTools, ...metaTools }, taskTool, inspectImageTool, dynamicTools: {} }),
    execute_typescript: codeModeResult.tool,
  };

  return { messages, tools, toolsetManager };
}

function getToolNames(toolsetId: string): string[] {
  return (
    getToolset(toolsetId)
      ?.tools()
      .map((tool) => tool.name) ?? []
  );
}

async function restoreToolsets(manager: ToolsetManager, toolsetIds: string[]): Promise<void> {
  if (toolsetIds.length === 0) return;

  await Promise.all(
    toolsetIds.map(async (id) => {
      const result = await manager.activate(id);
      if (result.status === 'not_found' || result.status === 'disabled') {
        log.warn(
          { event: 'toolset.restore.failed', toolsetId: id, reason: result.status },
          'failed to restore previously active toolset — skipping',
        );
      }
    }),
  );
}

function buildToolsetMetaTools(toolContext: ToolContext, manager: ToolsetManager): Record<string, Tool> {
  return Object.fromEntries(
    Object.entries(createToolsetTools(manager, toolContext.sessionId)).map(([name, tool]) => [
      name,
      wrapTool(toolContext, { name, displayName: name, tool, source: 'meta' }),
    ]),
  );
}

function buildTaskTool(
  toolContext: ToolContext,
  opts: SessionContextOptions,
  toolsetManager: ToolsetManager,
): Tool | null {
  const canUseTaskTool = opts.allowTaskTool ?? true;
  if (!canUseTaskTool) return null;

  return wrapTool(toolContext, {
    name: 'task',
    displayName: 'Task',
    tool: createTaskTool(toolContext, {
      parentSessionId: opts.sessionId,
      parentAbortSignal: opts.abortSignal,
      credentials: opts.credentials,
      modelId: opts.modelId,
      providerId: opts.credentials.providerId,
      toolsetManager,
    }),
    source: 'task',
  });
}

function buildInspectImageTool(toolContext: ToolContext, opts: SessionContextOptions): Tool {
  return wrapTool(toolContext, {
    name: 'inspect_image',
    displayName: 'Inspect Image',
    tool: createInspectImageTool(toolContext, {
      parentSessionId: opts.sessionId,
      parentAbortSignal: opts.abortSignal,
      credentials: opts.credentials,
      modelId: opts.modelId,
      providerId: opts.credentials.providerId,
    }),
    source: 'core',
  });
}

function mergeTools(parts: {
  staticTools: Record<string, Tool>;
  taskTool: Tool | null;
  inspectImageTool: Tool;
  dynamicTools: Record<string, Tool>;
}): Record<string, Tool> {
  return {
    ...parts.staticTools,
    ...(parts.taskTool ? { task: parts.taskTool } : {}),
    inspect_image: parts.inspectImageTool,
    ...parts.dynamicTools,
  };
}
