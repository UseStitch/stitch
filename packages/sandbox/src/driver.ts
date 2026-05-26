import { Worker } from 'node:worker_threads';

import {
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
  SandboxDriverOptions,
  ToolBinding,
} from './types.js';

const DEFAULT_MEMORY_LIMIT_MB = 128;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOOL_CALLS = 100;
const DEFAULT_MAX_MESSAGE_BYTES = 512 * 1024;
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

type WorkerWithBunOptions = ConstructorParameters<typeof Worker>[1] & {
  smol?: boolean;
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

function postToWorker(worker: Worker, message: HostMessage): void {
  worker.postMessage(message);
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

export function createWorkerSandbox(driverOptions?: SandboxDriverOptions): IsolateDriver {
  const workerUrl = driverOptions?.workerUrl ?? new URL('./worker-entry.ts', import.meta.url);

  return {
    async createContext(
      bindings: Record<string, ToolBinding>,
      options: IsolateOptions = {},
    ): Promise<IsolateContext> {
      const memoryLimitMb = options.memoryLimit ?? DEFAULT_MEMORY_LIMIT_MB;
      const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
      const maxToolCalls = options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
      const maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
      const libraries = options.libraries ?? {};
      const abortSignal = options.abortSignal;
      const toolTimeoutMs = Math.max(1_000, timeoutMs - TOOL_TIMEOUT_BUFFER_MS);
      const toolNames = Object.keys(bindings);
      validateLibraryNames(libraries);
      const workerOptions: WorkerWithBunOptions = {
        env: {},
        resourceLimits: {
          maxOldGenerationSizeMb: memoryLimitMb,
          maxYoungGenerationSizeMb: Math.max(1, Math.ceil(memoryLimitMb / 4)),
          stackSizeMb: 1,
        },
        smol: true,
        workerData: { toolNames, libraries },
      };

      const worker = new Worker(workerUrl, workerOptions);
      let disposed = false;
      let toolCallCount = 0;
      const timer = createPausableTimer();

      const terminate = () => {
        if (disposed) return;
        disposed = true;
        void worker.terminate();
      };

      return {
        async execute(code: string): Promise<IsolateExecuteResult> {
          if (disposed) return { result: { error: 'Sandbox context is disposed' }, logs: [] };

          const startedAt = Date.now();
          const timeoutRace = createExecutionTimeoutRace(timer, startedAt, timeoutMs, terminate);
          const abortPromise = createAbortRace(abortSignal, 'Sandbox execution aborted');

          const executionPromise = new Promise<IsolateExecuteResult>((resolve, reject) => {
            const cleanup = () => {
              worker.off('message', onMessage);
              worker.off('error', onError);
              worker.off('exit', onExit);
            };

            const sendToolError = (id: string, error: string) => {
              postToWorker(worker, { type: 'tool_error', id, error });
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
                postToWorker(worker, response);
              } catch (err) {
                sendToolError(message.id, toErrorMessage(err));
              } finally {
                timer.resume();
              }
            };

            const onMessage = (message: unknown) => {
              if (!isWorkerMessage(message)) return;

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

            const onError = (error: Error) => {
              cleanup();
              reject(error);
            };

            const onExit = (code: number) => {
              cleanup();
              if (disposed) {
                resolve({ result: { error: 'Sandbox execution terminated' }, logs: [] });
                return;
              }
              reject(new Error(`Sandbox worker exited with code ${code}`));
            };

            worker.on('message', onMessage);
            worker.on('error', onError);
            worker.on('exit', onExit);
            postToWorker(worker, { type: 'execute', code });
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
