import {
  SandboxMemoryError,
  SandboxMessageTooLargeError,
  SandboxSecurityError,
  SandboxTimeoutError,
  SandboxToolError,
  SandboxToolLimitError,
  SandboxUnknownToolError,
} from './errors.js';
import { isWorkerMessage } from './protocol.js';
import { createAbortRace, createExecutionTimeoutRace, createPausableTimer } from './timer.js';

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
const RESERVED_LIBRARY_NAMES = new Set([
  'console',
  'Bun',
  'process',
  'require',
  'fetch',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'XMLHttpRequest',
  'EventSource',
  'importScripts',
  'navigator',
  'location',
  'eval',
  'Function',
]);

type ProcessInitMessage = {
  type: 'init';
  toolNames: string[];
  libraries: IsolateOptions['libraries'];
  memoryReportIntervalMs: number;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getMessageSize(message: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(message)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function assertMessageSize(message: unknown, maxMessageBytes: number): void {
  const size = getMessageSize(message);
  if (size > maxMessageBytes) {
    throw new SandboxMessageTooLargeError(maxMessageBytes);
  }
}

function sendToProcess(
  proc: { send(message: unknown): void },
  message: HostMessage | ProcessInitMessage,
): void {
  proc.send(message);
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

      // Send initialization data via IPC
      sendToProcess(proc, {
        type: 'init',
        toolNames,
        libraries,
        memoryReportIntervalMs: MEMORY_REPORT_INTERVAL_MS,
      });

      return {
        async execute(code: string): Promise<IsolateExecuteResult> {
          if (disposed) return { result: { error: 'Sandbox context is disposed' }, logs: [] };

          const startedAt = Date.now();
          const timeoutRace = createExecutionTimeoutRace(timer, startedAt, timeoutMs, terminate);
          const abortPromise = createAbortRace(abortSignal, 'Sandbox execution aborted');

          const executionPromise = new Promise<IsolateExecuteResult>((resolve, reject) => {
            const cleanup = () => {
              messageHandler = null;
            };

            const sendToolError = (id: string, error: string) => {
              sendToProcess(proc, { type: 'tool_error', id, error });
            };

            const executeToolCall = async (
              message: Extract<WorkerMessage, { type: 'tool_call' }>,
            ) => {
              timer.pause();
              try {
                toolCallCount += 1;
                if (toolCallCount > maxToolCalls) {
                  sendToolError(message.id, new SandboxToolLimitError(maxToolCalls).message);
                  return;
                }

                assertMessageSize(message, maxMessageBytes);

                const binding = bindings[message.name];
                if (!binding) {
                  sendToolError(message.id, new SandboxUnknownToolError(message.name).message);
                  return;
                }

                let timeoutId: ReturnType<typeof setTimeout> | null = null;
                const toolTimeout = new Promise<never>((_, rejectTool) => {
                  timeoutId = setTimeout(
                    () =>
                      rejectTool(
                        new SandboxToolError(`Tool call timed out after ${toolTimeoutMs}ms`),
                      ),
                    toolTimeoutMs,
                  );
                  abortSignal?.addEventListener(
                    'abort',
                    () => {
                      if (timeoutId !== null) clearTimeout(timeoutId);
                    },
                    { once: true },
                  );
                });
                const toolAbort = createAbortRace(abortSignal, 'Tool call aborted');
                const raceTargets: Promise<unknown>[] = [
                  binding.execute(message.args, abortSignal),
                  toolTimeout,
                ];
                if (toolAbort !== null) raceTargets.push(toolAbort);

                const result = await Promise.race(raceTargets);
                if (timeoutId !== null) clearTimeout(timeoutId);
                const response: HostMessage = { type: 'tool_result', id: message.id, result };
                assertMessageSize(response, maxMessageBytes);
                sendToProcess(proc, response);
              } catch (err) {
                sendToolError(message.id, toErrorMessage(err));
              } finally {
                timer.resume();
              }
            };

            const onMessage = (message: unknown) => {
              if (!isWorkerMessage(message)) return;

              if (message.type === 'memory_report') {
                if (message.rss > memoryLimitBytes) {
                  cleanup();
                  terminate();
                  resolve({
                    result: { error: new SandboxMemoryError(memoryLimitMB).message },
                    logs: [],
                  });
                }
                return;
              }

              if (message.type === 'complete') {
                cleanup();
                resolve({ result: message.result, logs: message.logs });
                return;
              }

              if (message.type === 'error') {
                cleanup();
                resolve({ result: { error: message.error }, logs: message.logs });
                return;
              }

              void executeToolCall(message);
            };

            const onExit = () => {
              cleanup();
              if (disposed) {
                resolve({ result: { error: 'Sandbox execution terminated' }, logs: [] });
                return;
              }
              reject(new Error('Sandbox process exited unexpectedly'));
            };

            messageHandler = onMessage;
            void proc.exited.then(onExit);
            sendToProcess(proc, { type: 'execute', code });
          });

          try {
            const raceTargets: Promise<IsolateExecuteResult>[] = [
              executionPromise,
              timeoutRace.promise,
            ];
            if (abortPromise !== null) raceTargets.push(abortPromise);
            return await Promise.race(raceTargets);
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
          }
        },

        dispose() {
          terminate();
        },
      };
    },
  };
}
