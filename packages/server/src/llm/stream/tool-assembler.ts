import type { PrefixedString } from '@stitch/shared/id';

import { createCodeModeTool } from '@/code-mode/tool.js';
import * as Log from '@/lib/log.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { getSessionActiveToolsetIds } from '@/llm/stream/session-toolsets.js';
import { createTaskTool } from '@/tools/core/task.js';
import { createToolsetTools } from '@/tools/core/toolset-management.js';
import { createTools } from '@/tools/runtime/registry.js';
import { withToolResultHandling, withToolResultHandlingRecord } from '@/tools/runtime/wrappers.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';
import { ToolsetManager } from '@/tools/toolsets/manager.js';
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
  /** Static tools passed to the StreamRunner (core + meta + task + code_mode) */
  coreTools: Record<string, Tool>;
  /** ToolsetManager for dynamic toolset resolution at each step */
  toolsetManager: ToolsetManager;
  /** Code mode system prompt to append to the system message */
  codeModeSystemPrompt: string;
};

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
    const toolsetManager = new ToolsetManager(this.toolContext);
    await this.restoreToolsets(toolsetManager);

    const coreStitchTools = await this.buildCoreStitchTools();
    const toolsetMetaTools = this.buildToolsetMetaTools(toolsetManager);
    const taskTool = this.buildTaskTool(toolsetManager);

    const codeModeResult = createCodeModeTool({
      getTools: () =>
        this.mergeTools({
          core: coreStitchTools,
          meta: toolsetMetaTools,
          task: taskTool,
          dynamic: toolsetManager.getActiveTools(),
        }),
    });

    const coreTools = {
      ...this.mergeTools({
        core: coreStitchTools,
        meta: toolsetMetaTools,
        task: taskTool,
        dynamic: {},
      }),
      execute_typescript: codeModeResult.tool,
    };

    return {
      coreTools,
      toolsetManager,
      codeModeSystemPrompt: codeModeResult.getSystemPrompt(),
    };
  }

  private async restoreToolsets(manager: ToolsetManager): Promise<void> {
    const ids = this.opts.activeToolsetIds ?? getSessionActiveToolsetIds(this.opts.sessionId);

    if (ids.length === 0) return;

    await Promise.all(
      ids.map(async (id) => {
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

  private async buildCoreStitchTools(): Promise<Record<string, Tool>> {
    return createTools(this.toolContext);
  }

  private buildToolsetMetaTools(manager: ToolsetManager): Record<string, Tool> {
    return withToolResultHandlingRecord(createToolsetTools(manager, this.toolContext.sessionId));
  }

  private buildTaskTool(toolsetManager: ToolsetManager): Tool | null {
    const canUseTaskTool = this.opts.allowTaskTool ?? true;
    if (!canUseTaskTool) return null;

    return withToolResultHandling(
      createTaskTool(this.toolContext, {
        parentSessionId: this.opts.sessionId,
        parentAbortSignal: this.opts.abortSignal,
        credentials: this.opts.credentials,
        modelId: this.opts.modelId,
        providerId: this.opts.credentials.providerId,
        toolsetManager,
      }),
    );
  }

  private mergeTools(parts: {
    core: Record<string, Tool>;
    meta: Record<string, Tool>;
    task: Tool | null;
    dynamic: Record<string, Tool>;
  }): Record<string, Tool> {
    return {
      ...parts.core,
      ...parts.meta,
      ...(parts.task ? { task: parts.task } : {}),
      ...parts.dynamic,
    };
  }
}
