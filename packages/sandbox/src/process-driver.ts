import {
  SandboxMemoryError,
  SandboxMessageTooLargeError,
  SandboxSecurityError,
  SandboxTimeoutError,
  SandboxToolLimitError,
  SandboxUnknownToolError,
  toErrorMessage,
} from './errors.js';
import { DANGEROUS_GLOBALS } from './hardening.js';
import { isWorkerMessage } from './protocol.js';
import {
  createAbortRace,
  createExecutionTimeoutRace,
  createPausableTimer,
  createToolTimeoutRace,
} from './timer.js';

import type { HostMessage, WorkerMessage } from './protocol.js';
import type {
  IsolateContext,
  IsolateDriver,
  IsolateExecuteResult,
  IsolateOptions,
  SandboxProcessDriverOptions,
  ToolBinding,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOOL_CALLS = 100;
const DEFAULT_MAX_MESSAGE_BYTES = 512 * 1024;
const DEFAULT_MEMORY_LIMIT_MB = 512;
const MEMORY_REPORT_INTERVAL_MS = 500;
const TOOL_TIMEOUT_BUFFER_MS = 5_000;
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;
const RESERVED_LIBRARY_NAMES = new Set([...DANGEROUS_GLOBALS, 'console', 'Function']);
const encoder = new TextEncoder();

type ToolCallContext = {
  bindings: Record<string, ToolBinding>;
  maxToolCalls: number;
  maxMessageBytes: number;
  toolTimeoutMs: number;
  abortSignal: AbortSignal | undefined;
  proc: { send(message: unknown): void };
  timer: ReturnType<typeof createPausableTimer>;
  incrementToolCallCount: () => number;
};

function assertMessageSize(message: unknown, maxMessageBytes: number): void {
  // Serialization failure counts as oversized — can't trust it won't blow up the IPC channel.
  let size: number;
  try {
    size = encoder.encode(JSON.stringify(message)).byteLength;
  } catch {
    size = Number.POSITIVE_INFINITY;
  }
  if (size > maxMessageBytes) {
    throw new SandboxMessageTooLargeError(maxMessageBytes);
  }
}

function validateLibraryNames(libraries: IsolateOptions['libraries']): void {
  for (const [name, library] of Object.entries(libraries ?? {})) {
    if (!IDENTIFIER_PATTERN.test(name) || RESERVED_LIBRARY_NAMES.has(name)) {
      throw new SandboxSecurityError(`Invalid sandbox library name: ${name}`);
    }
    if (
      library.globalName !== undefined &&
      (!IDENTIFIER_PATTERN.test(library.globalName) ||
        RESERVED_LIBRARY_NAMES.has(library.globalName))
    ) {
      throw new SandboxSecurityError(`Invalid sandbox library global name: ${library.globalName}`);
    }
  }
}

async function dispatchToolCall(
  message: Extract<WorkerMessage, { type: 'tool_call' }>,
  ctx: ToolCallContext,
): Promise<void> {
  ctx.timer.pause();
  try {
    const count = ctx.incrementToolCallCount();
    if (count > ctx.maxToolCalls) {
      ctx.proc.send({
        type: 'tool_error',
        id: message.id,
        error: new SandboxToolLimitError(ctx.maxToolCalls).message,
      });
      return;
    }

    assertMessageSize(message, ctx.maxMessageBytes);

    const binding = ctx.bindings[message.name];
    if (!binding) {
      ctx.proc.send({
        type: 'tool_error',
        id: message.id,
        error: new SandboxUnknownToolError(message.name).message,
      });
      return;
    }

    const timeoutRace = createToolTimeoutRace(
      ctx.toolTimeoutMs,
      ctx.abortSignal,
      `Tool call timed out after ${ctx.toolTimeoutMs}ms`,
    );
    try {
      const result = await Promise.race([
        binding.execute(message.args, ctx.abortSignal),
        timeoutRace.promise,
      ]);

      const response: HostMessage = { type: 'tool_result', id: message.id, result };
      assertMessageSize(response, ctx.maxMessageBytes);
      ctx.proc.send(response);
    } finally {
      timeoutRace.cleanup();
    }
  } catch (err) {
    ctx.proc.send({ type: 'tool_error', id: message.id, error: toErrorMessage(err) });
  } finally {
    ctx.timer.resume();
  }
}

/**
 * Creates a process-based sandbox driver that spawns a separate Bun process for isolation.
 * Communicates via Bun's IPC channel (structured clone serialization).
 *
 * This provides stronger isolation than Worker threads:
 * - Completely separate address space (OS process boundary)
 * - No shared memory or prototype chain
 * - Reliable kill semantics via process.kill()
 * - Works consistently across platforms (no import.meta.url resolution issues)
 */
export function createProcessSandbox(driverOptions: SandboxProcessDriverOptions): IsolateDriver {
  const execPath = driverOptions.execPath;
  const memoryLimitMB = driverOptions.memoryLimit ?? DEFAULT_MEMORY_LIMIT_MB;
  const memoryLimitBytes = memoryLimitMB * 1024 * 1024;
  const isScript = /\.[mc]?[jt]sx?$/.test(execPath);
  const cmd = isScript ? [process.execPath, '--smol', execPath] : [execPath];

  return {
    async createContext(
      bindings: Record<string, ToolBinding>,
      options: IsolateOptions = {},
    ): Promise<IsolateContext> {
      const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
      const maxToolCalls = options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
      const maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
      const libraries = options.libraries ?? {};
      const abortSignal = options.abortSignal;
      const toolTimeoutMs = Math.max(1_000, timeoutMs - TOOL_TIMEOUT_BUFFER_MS);
      const toolNames = Object.keys(bindings);
      validateLibraryNames(libraries);

      let disposed = false;
      let toolCallCount = 0;
      const timer = createPausableTimer();
      let messageHandler: ((message: unknown) => void) | null = null;

      const proc = Bun.spawn(cmd, {
        env: { BUN_JSC_forceRAMSize: String(memoryLimitBytes) },
        ipc(message) {
          messageHandler?.(message);
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const terminate = () => {
        if (disposed) return;
        disposed = true;
        try {
          proc.kill();
        } catch {
          // Process may have already exited.
        }
      };

      proc.send({
        type: 'init',
        toolNames,
        libraries,
        memoryReportIntervalMs: MEMORY_REPORT_INTERVAL_MS,
      });

      const toolCallCtx: ToolCallContext = {
        bindings,
        maxToolCalls,
        maxMessageBytes,
        toolTimeoutMs,
        abortSignal,
        proc,
        timer,
        incrementToolCallCount: () => ++toolCallCount,
      };

      return {
        async execute(code: string): Promise<IsolateExecuteResult> {
          if (disposed) return { result: { error: 'Sandbox context is disposed' }, logs: [] };

          const startedAt = Date.now();
          const timeoutRace = createExecutionTimeoutRace(timer, startedAt, timeoutMs, terminate);
          const abortRace = createAbortRace(abortSignal, 'Sandbox execution aborted');

          let settled = false;
          const executionPromise = new Promise<IsolateExecuteResult>((resolve, reject) => {
            const cleanup = () => {
              messageHandler = null;
            };

            const settle = (value: IsolateExecuteResult) => {
              settled = true;
              resolve(value);
            };

            const onMessage = (message: unknown) => {
              if (!isWorkerMessage(message)) return;

              if (message.type === 'memory_report') {
                if (message.rss > memoryLimitBytes) {
                  cleanup();
                  terminate();
                  settle({
                    result: { error: new SandboxMemoryError(memoryLimitMB).message },
                    logs: [],
                  });
                }
                return;
              }

              if (message.type === 'complete') {
                cleanup();
                settle({ result: message.result, logs: message.logs });
                return;
              }

              if (message.type === 'error') {
                cleanup();
                settle({ result: { error: message.error }, logs: message.logs });
                return;
              }

              void dispatchToolCall(message, toolCallCtx);
            };

            const onExit = () => {
              cleanup();
              if (settled) return;
              if (disposed) {
                settle({ result: { error: 'Sandbox execution terminated' }, logs: [] });
                return;
              }
              reject(new Error('Sandbox process exited unexpectedly'));
            };

            messageHandler = onMessage;
            void proc.exited.then(onExit);
            proc.send({ type: 'execute', code });
          });

          try {
            return await Promise.race([executionPromise, timeoutRace.promise, abortRace.promise]);
          } catch (err) {
            terminate();
            return {
              result: {
                error: timeoutRace.isTimedOut()
                  ? new SandboxTimeoutError(timeoutMs).message
                  : toErrorMessage(err),
              },
              logs: [],
            };
          } finally {
            timeoutRace.cleanup();
            abortRace.cleanup();
          }
        },

        dispose() {
          terminate();
        },
      };
    },
  };
}
