import type { PrefixedString } from '@stitch/shared/id';

import { createCodeModeTool } from '@/code-mode/tool.js';
import * as Log from '@/lib/log.js';
import { PromptComposer } from '@/llm/prompt/composer.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { buildActiveToolsetInstructionsBlock } from '@/llm/session-summary.js';
import {
  getCurrentSessionToolsetState,
  getSessionToolsetState,
  type SessionExpiredToolset,
} from '@/llm/stream/session-toolsets.js';
import { buildSkillsSystemPrompt } from '@/skills/service.js';
import { createInspectImageTool } from '@/tools/core/inspect-image.js';
import { createTaskTool } from '@/tools/core/task.js';
import { createToolsetTools } from '@/tools/core/toolset-management.js';
import { ToolPipeline } from '@/tools/runtime/pipeline.js';
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
  credentials: ProviderCredentials;
  modelId: string;
  abortSignal: AbortSignal;
  llmMessages: ModelMessage[];
  activeToolsetIds?: string[];
  allowTaskTool?: boolean;
};

type AssembledResult = {
  messages: ModelMessage[];
  tools: Record<string, Tool>;
  toolsetManager: ToolsetManager;
};

async function buildAvailableToolsetsPrompt(manager: ToolsetManager): Promise<string> {
  const catalog = await manager.getCatalogWithState({ includeTools: true });
  if (catalog.length === 0) return '';

  const lines = catalog.map((item) => {
    const tools = (item.tools ?? [])
      .slice(0, 3)
      .map((tool) => `${tool.name}: ${tool.description}`)
      .join('; ');
    const active = item.active ? 'active' : 'inactive';
    const toolSummary = tools ? ` Tools: ${tools}.` : '';
    return `- ${item.name} (${item.id}, ${active}): ${item.description}.${toolSummary}`;
  });

  return [
    '## Available Toolsets',
    '',
    'Use `activate_toolset` when a listed toolset clearly matches the task. Prefer matching domain-specific data toolsets over generic web search: financial data for stock prices, earnings, and financials; email for email; calendar for calendar; GitHub/repository-knowledge for GitHub repository questions; databases for database questions. Use web search only when no specialized toolset can provide the needed facts. Do not activate unrelated toolsets. If a toolset is already active, call its tools directly; do not re-activate it. Do not deactivate a toolset you are likely to use again this session; only deactivate to free context when switching to an unrelated domain.',
    '',
    ...lines,
  ].join('\n');
}

export function buildExpiredToolsetsPrompt(expired: SessionExpiredToolset[]): string {
  if (expired.length === 0) return '';

  const lines = expired.map((entry) => {
    const toolset = getToolset(entry.id);
    const name = toolset?.name ?? entry.id;
    const tools =
      entry.toolNames.length > 0
        ? ` Tools no longer available: ${entry.toolNames.join(', ')}.`
        : '';
    return `- ${name} (${entry.id}) expired at the last turn boundary.${tools}`;
  });

  return [
    '## Toolset Expiry Notice',
    '',
    'These toolsets were active in the previous run but are not loaded for this turn. Do not call their tools unless you first call `activate_toolset` again.',
    '',
    ...lines,
  ].join('\n');
}

export class SessionContext {
  private readonly toolContext: ToolContext;

  private constructor(private readonly opts: SessionContextOptions) {
    this.toolContext = {
      sessionId: opts.sessionId,
      messageId: opts.messageId,
      streamRunId: opts.streamRunId,
    };
  }

  static create(opts: SessionContextOptions): SessionContext {
    return new SessionContext(opts);
  }

  async assemble(): Promise<AssembledResult> {
    const sessionState = getSessionToolsetState(this.opts.sessionId);
    const currentSessionState = getCurrentSessionToolsetState(sessionState, (toolsetId) =>
      SessionContext.getToolNames(toolsetId),
    );
    const activeEntries = this.opts.activeToolsetIds
      ? this.opts.activeToolsetIds.map((id) => ({ id, scope: 'until_deactivated' as const }))
      : currentSessionState.active;
    const expiredEntries = this.opts.activeToolsetIds ? [] : currentSessionState.expired;
    const expiredPrompt = this.opts.activeToolsetIds
      ? ''
      : buildExpiredToolsetsPrompt(expiredEntries);

    const toolsetManager = new ToolsetManager(this.toolContext, activeEntries);
    await this.restoreToolsets(
      toolsetManager,
      activeEntries.map((entry) => entry.id),
    );

    const coreTools = await createTools(this.toolContext);
    const metaTools = this.buildToolsetMetaTools(toolsetManager);
    const taskTool = this.buildTaskTool(toolsetManager);
    const inspectImageTool = this.buildInspectImageTool();
    const codeModeResult = createCodeModeTool({
      getTools: () =>
        this.mergeTools({
          staticTools: { ...coreTools, ...metaTools },
          taskTool,
          inspectImageTool,
          dynamicTools: toolsetManager.getActiveTools(),
        }),
      abortSignal: this.opts.abortSignal,
    });
    const toolsetsPrompt = await buildAvailableToolsetsPrompt(toolsetManager);
    const skillsPrompt = await buildSkillsSystemPrompt();

    const composer = new PromptComposer();
    composer
      .add('semiStatic', codeModeResult.getSystemPrompt())
      .add('semiStatic', expiredPrompt)
      .add('semiStatic', toolsetsPrompt)
      .add('semiStatic', skillsPrompt);

    const instructionsBlock = buildActiveToolsetInstructionsBlock(this.opts.sessionId);
    composer.add('dynamic', instructionsBlock);

    const tools = {
      ...this.mergeTools({
        staticTools: { ...coreTools, ...metaTools },
        taskTool,
        inspectImageTool,
        dynamicTools: {},
      }),
      execute_typescript: codeModeResult.tool,
    };

    return {
      messages: composer.compose(this.opts.llmMessages),
      tools,
      toolsetManager,
    };
  }

  private static getToolNames(toolsetId: string): string[] {
    return (
      getToolset(toolsetId)
        ?.tools()
        .map((tool) => tool.name) ?? []
    );
  }

  private async restoreToolsets(manager: ToolsetManager, toolsetIds: string[]): Promise<void> {
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

  private buildToolsetMetaTools(manager: ToolsetManager): Record<string, Tool> {
    const pipeline = ToolPipeline.create(this.toolContext);
    return pipeline.registerAll(
      Object.entries(createToolsetTools(manager, this.toolContext.sessionId)).map(
        ([name, tool]) => ({
          name,
          displayName: name,
          tool,
          source: 'meta' as const,
        }),
      ),
    );
  }

  private buildTaskTool(toolsetManager: ToolsetManager): Tool | null {
    const canUseTaskTool = this.opts.allowTaskTool ?? true;
    if (!canUseTaskTool) return null;

    const pipeline = ToolPipeline.create(this.toolContext);
    return pipeline.register({
      name: 'task',
      displayName: 'Task',
      tool: createTaskTool(this.toolContext, {
        parentSessionId: this.opts.sessionId,
        parentAbortSignal: this.opts.abortSignal,
        credentials: this.opts.credentials,
        modelId: this.opts.modelId,
        providerId: this.opts.credentials.providerId,
        toolsetManager,
      }),
      source: 'task',
    });
  }

  private buildInspectImageTool(): Tool {
    const pipeline = ToolPipeline.create(this.toolContext);
    return pipeline.register({
      name: 'inspect_image',
      displayName: 'Inspect Image',
      tool: createInspectImageTool(this.toolContext, {
        parentSessionId: this.opts.sessionId,
        parentAbortSignal: this.opts.abortSignal,
        credentials: this.opts.credentials,
        modelId: this.opts.modelId,
        providerId: this.opts.credentials.providerId,
      }),
      source: 'core',
    });
  }

  private mergeTools(parts: {
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
}
