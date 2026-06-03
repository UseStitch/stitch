import type { PrefixedString } from '@stitch/shared/id';

import { createCodeModeTool } from '@/code-mode/tool.js';
import * as Log from '@/lib/log.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { getSessionActiveToolsetIds } from '@/llm/stream/session-toolsets.js';
import { buildSkillsSystemPrompt } from '@/skills/service.js';
import { createInspectImageTool } from '@/tools/core/inspect-image.js';
import { createTaskTool } from '@/tools/core/task.js';
import { createToolsetTools } from '@/tools/core/toolset-management.js';
import { resultNormalizationMiddleware } from '@/tools/runtime/middleware.js';
import { createTools } from '@/tools/runtime/registry.js';
import { createToolRuntime, defineRuntimeTool } from '@/tools/runtime/runtime.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import { ToolsetManager } from '@/tools/toolsets/manager.js';
import { getToolset } from '@/tools/toolsets/registry.js';
import type { Tool } from 'ai';

const log = Log.create({ service: 'tool-assembler' });

type ToolAssemblerOptions = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  credentials: ProviderCredentials;
  modelId: string;
  abortSignal: AbortSignal;
  activeToolsetIds?: string[];
  allowTaskTool?: boolean;
};

type AssembledTools = {
  staticTools: Record<string, Tool>;
  toolsetManager: ToolsetManager;
  promptAdditions: string[];
};

async function buildAvailableToolsetsPrompt(manager: ToolsetManager): Promise<string> {
  const catalog = await manager.getCatalogWithState();
  if (catalog.length === 0) return '';

  const lines = catalog.map((item) => {
    const toolset = getToolset(item.id);
    const tools = toolset
      ?.tools()
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
    'Use `activate_toolset` when a listed toolset clearly matches the task. For web/current-info tasks, prefer relevant web-search MCP toolsets when available. For GitHub repository questions, prefer relevant repository-knowledge MCP toolsets when available. Do not activate unrelated toolsets.',
    '',
    ...lines,
  ].join('\n');
}

export class ToolAssembler {
  private readonly toolContext: ToolContext;

  private constructor(private readonly opts: ToolAssemblerOptions) {
    this.toolContext = {
      sessionId: opts.sessionId,
      messageId: opts.messageId,
      streamRunId: opts.streamRunId,
    };
  }

  static create(opts: ToolAssemblerOptions): ToolAssembler {
    return new ToolAssembler(opts);
  }

  async assemble(): Promise<AssembledTools> {
    const persistedToolsetIds =
      this.opts.activeToolsetIds ?? getSessionActiveToolsetIds(this.opts.sessionId);
    const toolsetManager = new ToolsetManager(this.toolContext, persistedToolsetIds);
    await this.restoreToolsets(toolsetManager, persistedToolsetIds);

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

    return {
      staticTools: {
        ...this.mergeTools({
          staticTools: { ...coreTools, ...metaTools },
          taskTool,
          inspectImageTool,
          dynamicTools: {},
        }),
        execute_typescript: codeModeResult.tool,
      },
      toolsetManager,
      promptAdditions: [codeModeResult.getSystemPrompt(), toolsetsPrompt, skillsPrompt].filter(
        Boolean,
      ),
    };
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
    const runtime = createToolRuntime(this.toolContext).use(resultNormalizationMiddleware());
    return runtime.toAiToolRecord(
      Object.entries(createToolsetTools(manager, this.toolContext.sessionId)).map(([name, tool]) =>
        defineRuntimeTool(name, tool, { source: 'meta' }),
      ),
    );
  }

  private buildTaskTool(toolsetManager: ToolsetManager): Tool | null {
    const canUseTaskTool = this.opts.allowTaskTool ?? true;
    if (!canUseTaskTool) return null;

    const runtime = createToolRuntime(this.toolContext).use(resultNormalizationMiddleware());
    return runtime.wrapTool(
      'task',
      createTaskTool(this.toolContext, {
        parentSessionId: this.opts.sessionId,
        parentAbortSignal: this.opts.abortSignal,
        credentials: this.opts.credentials,
        modelId: this.opts.modelId,
        providerId: this.opts.credentials.providerId,
        toolsetManager,
      }),
      { source: 'task' },
    );
  }

  private buildInspectImageTool(): Tool {
    const runtime = createToolRuntime(this.toolContext).use(resultNormalizationMiddleware());
    return runtime.wrapTool(
      'inspect_image',
      createInspectImageTool(this.toolContext, {
        parentSessionId: this.opts.sessionId,
        parentAbortSignal: this.opts.abortSignal,
        credentials: this.opts.credentials,
        modelId: this.opts.modelId,
        providerId: this.opts.credentials.providerId,
      }),
      { source: 'core' },
    );
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
