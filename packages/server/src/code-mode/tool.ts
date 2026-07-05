import { tool } from 'ai';
import { z } from 'zod';

import { createProcessSandbox } from '@stitch/sandbox';
import type { IsolateDriver, IsolateOptions } from '@stitch/sandbox';

import { toolsToBindings, toolsToTypeInfo } from '@/code-mode/bindings/tool-binding.js';
import { applyToolFilter } from '@/code-mode/filter.js';
import type { CodeModeToolFilter } from '@/code-mode/filter.js';
import { stripTypeScript } from '@/code-mode/strip-typescript.js';
import { buildCodeModeSystemPrompt } from '@/code-mode/system-prompt.js';
import * as Log from '@/lib/log.js';
import { truncateOutput } from '@/tools/runtime/truncation.js';
import type { Tool } from 'ai';

const log = Log.create({ service: 'code-mode' });

function getDefaultDriver(): IsolateDriver {
  const sandboxExecPath = process.env['SANDBOX_EXEC_PATH'];
  if (!sandboxExecPath) {
    return {
      async createContext() {
        throw new Error(
          'SANDBOX_EXEC_PATH environment variable is required. ' +
            'Set it to the path of the compiled sandbox process binary.',
        );
      },
    };
  }
  return createProcessSandbox({ execPath: sandboxExecPath });
}

type CodeModeOptions = {
  getTools: () => Record<string, Tool>;
  driver?: IsolateDriver;
  filter?: CodeModeToolFilter;
  isolateOptions?: IsolateOptions;
  abortSignal?: AbortSignal;
};

type CodeModeToolResult = { tool: Tool; getSystemPrompt: () => string };

export function createCodeModeTool(options: CodeModeOptions): CodeModeToolResult {
  const driver = options.driver ?? getDefaultDriver();
  const filter = options.filter ?? {};
  const isolateOptions = options.isolateOptions ?? {};

  const getFilteredTools = () => applyToolFilter(options.getTools(), filter);

  const codeModeInputSchema = z.object({
    code: z
      .string()
      .min(1)
      .describe('TypeScript code to execute in the sandbox. May use external_* functions for tool calls.'),
    description: z.string().min(1).describe('Short plain-language description (5-10 words) of what this code does'),
  });

  const codeModeToolInstance = tool({
    description: `Execute TypeScript code in a secure sandbox to orchestrate multiple tool calls, transform data, or implement multi-step logic.

Use this when you need to:
- Call multiple tools and combine their results
- Use loops, conditionals, or data transformations across tool outputs
- Parallelize independent tool calls with Promise.all
- Implement logic that would require many sequential tool steps

The sandbox has access to all active tools as \`external_*\` async functions.
The sandbox has no filesystem, network, or Node.js access beyond these functions.`,
    inputSchema: codeModeInputSchema,
    execute: async ({ code, description }, { abortSignal: callAbortSignal }) => {
      const abortSignal = callAbortSignal ?? options.abortSignal;
      const startedAt = Date.now();

      const stripped = stripTypeScript(code);
      if (stripped.error !== null) {
        log.warn({ event: 'code-mode.syntax-error', description, error: stripped.error }, 'code mode syntax error');
        return { error: `Syntax error in provided code:\n${stripped.error}`, description };
      }

      const filteredTools = getFilteredTools();
      const bindings = toolsToBindings(filteredTools, abortSignal);

      log.info(
        {
          event: 'code-mode.execute.start',
          description,
          bindingCount: Object.keys(bindings).length,
          bindingNames: Object.keys(bindings),
        },
        'executing code mode',
      );

      const context = await driver.createContext(bindings, createCodeModeIsolateOptions(isolateOptions, abortSignal));

      let execResult: { result: unknown; logs: string[] };
      try {
        execResult = await context.execute(stripped.code);
      } finally {
        try {
          context.dispose();
        } catch (disposeErr) {
          log.warn({ event: 'code-mode.dispose.error', error: String(disposeErr) }, 'context dispose failed');
        }
      }

      const durationMs = Date.now() - startedAt;

      log.info(
        {
          event: 'code-mode.execute.finish',
          description,
          durationMs,
          logCount: execResult.logs.length,
          hasError: isErrorResult(execResult.result),
        },
        'code mode execution complete',
      );

      const resultText = serializeIsolateOutput(execResult.result, execResult.logs);
      const truncated = await truncateOutput(resultText);

      if (truncated.truncated) {
        return { description, output: truncated.content, truncated: true, durationMs };
      }

      return { description, output: resultText, truncated: false, durationMs };
    },
  });

  return {
    tool: codeModeToolInstance,

    getSystemPrompt(): string {
      const filteredTools = getFilteredTools();
      const typeInfo = toolsToTypeInfo(filteredTools);
      return buildCodeModeSystemPrompt(typeInfo, ['libpdf']);
    },
  };
}

function createCodeModeIsolateOptions(
  isolateOptions: IsolateOptions,
  abortSignal: AbortSignal | undefined,
): IsolateOptions {
  return {
    ...isolateOptions,
    abortSignal,
    libraries: { ...isolateOptions.libraries, libpdf: { specifier: '@libpdf/core' } },
  };
}

export function isErrorResult(result: unknown): result is { error: unknown } {
  return result !== null && typeof result === 'object' && 'error' in result;
}

export function serializeIsolateOutput(result: unknown, logs: string[]): string {
  const parts: string[] = [];

  if (logs.length > 0) {
    parts.push('=== Console Output ===');
    parts.push(logs.join('\n'));
    parts.push('');
  }

  parts.push('=== Result ===');

  if (result === null || result === undefined) {
    parts.push('(no return value)');
  } else if (isErrorResult(result)) {
    const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
    parts.push(`Error: ${errMsg}`);
  } else {
    try {
      parts.push(JSON.stringify(result, null, 2));
    } catch {
      parts.push('[unserializable result]');
    }
  }

  return parts.join('\n');
}
