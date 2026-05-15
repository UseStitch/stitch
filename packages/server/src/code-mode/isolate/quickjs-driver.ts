import quickJSVariant from '@jitl/quickjs-singlefile-mjs-release-asyncify';
import { newQuickJSAsyncWASMModuleFromVariant } from 'quickjs-emscripten-core';

import type {
  IsolateContext,
  IsolateDriver,
  IsolateExecuteResult,
  IsolateOptions,
  ToolBinding,
} from '@/code-mode/isolate/types.js';

const DEFAULT_MEMORY_LIMIT_MB = 128;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_STACK_SIZE = 512 * 1024;
// Cap per-tool-result JSON at 512 KB before it enters the WASM heap
const MAX_RESULT_BYTES = 512 * 1024;
// Per-tool call timeout: slightly under the sandbox timeout so a hung tool
// unblocks before the outer timer fires
const TOOL_TIMEOUT_BUFFER_MS = 5_000;
// Absolute wall-clock ceiling regardless of pause state — last-resort hang guard
const ABSOLUTE_TIMEOUT_MS = 5 * 60 * 1000;

function wrapWithPausableTimeout(
  execute: (input: unknown, abortSignal?: AbortSignal) => Promise<unknown>,
  pauseTimer: () => void,
  resumeTimer: () => void,
  toolTimeoutMs: number,
  abortSignal?: AbortSignal,
): (input: unknown) => Promise<unknown> {
  return async (input) => {
    pauseTimer();
    try {
      const toolTimeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(
          () => reject(new Error(`Tool call timed out after ${toolTimeoutMs}ms`)),
          toolTimeoutMs,
        );
        // Clean up timer if signal fires first
        abortSignal?.addEventListener('abort', () => clearTimeout(id), { once: true });
      });

      const abortPromise =
        abortSignal !== undefined
          ? new Promise<never>((_, reject) => {
              if (abortSignal.aborted) {
                reject(new Error('Tool call aborted'));
                return;
              }
              abortSignal.addEventListener('abort', () => reject(new Error('Tool call aborted')), {
                once: true,
              });
            })
          : null;

      const raceTargets: Promise<unknown>[] = [execute(input, abortSignal), toolTimeoutPromise];
      if (abortPromise !== null) raceTargets.push(abortPromise);

      return await Promise.race(raceTargets);
    } finally {
      resumeTimer();
    }
  };
}

export function createQuickJSDriver(): IsolateDriver {
  return {
    async createContext(
      bindings: Record<string, ToolBinding>,
      options: IsolateOptions = {},
    ): Promise<IsolateContext> {
      const memoryLimitMb = options.memoryLimit ?? DEFAULT_MEMORY_LIMIT_MB;
      const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
      const abortSignal = options.abortSignal;
      const toolTimeoutMs = Math.max(1_000, timeoutMs - TOOL_TIMEOUT_BUFFER_MS);

      const module = await newQuickJSAsyncWASMModuleFromVariant(quickJSVariant);
      const runtime = module.newRuntime();
      runtime.setMemoryLimit(memoryLimitMb * 1024 * 1024);
      runtime.setMaxStackSize(MAX_STACK_SIZE);

      const vm = runtime.newContext();
      const logs: string[] = [];
      let runtimeAlive = true;

      const consoleHandle = vm.newObject();
      for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
        const fn = vm.newFunction(level, (...args) => {
          const parts = args.map((arg) => {
            try {
              const dumped = vm.dump(arg);
              return typeof dumped === 'string' ? dumped : JSON.stringify(dumped);
            } catch {
              return '[unserializable]';
            }
          });
          logs.push(`[${level}] ${parts.join(' ')}`);
        });
        vm.setProp(consoleHandle, level, fn);
        fn.dispose();
      }
      vm.setProp(vm.global, 'console', consoleHandle);
      consoleHandle.dispose();

      let pausedAt: number | null = null;
      let totalPausedMs = 0;

      const pauseTimer = () => {
        if (pausedAt === null) pausedAt = Date.now();
      };

      const resumeTimer = () => {
        if (pausedAt !== null) {
          totalPausedMs += Date.now() - pausedAt;
          pausedAt = null;
        }
      };

      for (const [name, binding] of Object.entries(bindings)) {
        const wrappedExecute = wrapWithPausableTimeout(
          binding.execute,
          pauseTimer,
          resumeTimer,
          toolTimeoutMs,
          abortSignal,
        );

        const fn = vm.newAsyncifiedFunction(name, async (...args) => {
          const inputHandle = args[0];
          let input: unknown;
          try {
            input = inputHandle ? vm.dump(inputHandle) : undefined;
          } catch {
            input = undefined;
          }

          let result: unknown;
          try {
            result = await wrappedExecute(input);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // Guard against returning a handle into a dead WASM runtime
            if (!runtimeAlive) return vm.undefined;
            return vm.newString(JSON.stringify({ __error: message }));
          }

          // Guard against returning a handle into a dead WASM runtime
          if (!runtimeAlive) return vm.undefined;

          try {
            let serialized = JSON.stringify(result ?? null);
            if (serialized.length > MAX_RESULT_BYTES) {
              serialized = serialized.slice(0, MAX_RESULT_BYTES) + '…[truncated]"';
            }
            return vm.newString(serialized);
          } catch {
            return vm.newString(JSON.stringify({ __error: 'Result could not be serialized' }));
          }
        });

        vm.setProp(vm.global, name, fn);
        fn.dispose();
      }

      const parseResultFn = vm.newFunction('__parseResult', (jsonHandle) => {
        const json = vm.dump(jsonHandle) as string;
        try {
          const parsed = JSON.parse(json);
          if (parsed && typeof parsed === 'object' && '__error' in parsed) {
            throw new Error(String(parsed.__error));
          }
          return vm.newString(JSON.stringify(parsed));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(message);
        }
      });
      vm.setProp(vm.global, '__parseResult', parseResultFn);
      parseResultFn.dispose();

      return {
        async execute(code: string): Promise<IsolateExecuteResult> {
          const wrappedCode = `
(async () => {
  try {
    const __result = await (async () => {
      ${code}
    })();
    return __result;
  } catch (e) {
    return { __codeError: e && e.message ? e.message : String(e) };
  }
})()
`;

          const startedAt = Date.now();
          let pausableTimeoutId: ReturnType<typeof setTimeout> | null = null;
          let absoluteTimeoutId: ReturnType<typeof setTimeout> | null = null;
          let timedOut = false;

          const timeoutPromise = new Promise<never>((_, reject) => {
            // Pausable timeout: only counts time the sandbox is actually running
            const checkPausable = () => {
              const paused = pausedAt !== null ? Date.now() - pausedAt : 0;
              const elapsed = Date.now() - startedAt - totalPausedMs - paused;
              if (elapsed >= timeoutMs) {
                timedOut = true;
                reject(new Error(`Code mode execution timed out after ${timeoutMs}ms`));
              } else {
                pausableTimeoutId = setTimeout(checkPausable, 100);
              }
            };
            pausableTimeoutId = setTimeout(checkPausable, 100);

            // Absolute wall-clock timeout: fires regardless of pause state
            absoluteTimeoutId = setTimeout(() => {
              timedOut = true;
              reject(
                new Error(
                  `Code mode execution exceeded absolute limit of ${ABSOLUTE_TIMEOUT_MS}ms`,
                ),
              );
            }, ABSOLUTE_TIMEOUT_MS);
          });

          // Abort signal fires immediately if already aborted, or on abort event
          const abortPromise =
            abortSignal !== undefined
              ? new Promise<never>((_, reject) => {
                  if (abortSignal.aborted) {
                    reject(new Error('Code mode execution aborted'));
                    return;
                  }
                  abortSignal.addEventListener(
                    'abort',
                    () => reject(new Error('Code mode execution aborted')),
                    { once: true },
                  );
                })
              : null;

          const clearTimers = () => {
            if (pausableTimeoutId !== null) clearTimeout(pausableTimeoutId);
            if (absoluteTimeoutId !== null) clearTimeout(absoluteTimeoutId);
          };

          let result: unknown;
          try {
            let evalResult: unknown;
            try {
              const evalPromise = vm.evalCodeAsync(wrappedCode);
              const raceTargets: Promise<unknown>[] = [evalPromise, timeoutPromise];
              if (abortPromise !== null) raceTargets.push(abortPromise);
              evalResult = await Promise.race(raceTargets);
            } catch (syncErr) {
              // WASM errors can throw synchronously from evalCodeAsync before
              // returning a promise — catch and convert to a rejection
              throw syncErr instanceof Error ? syncErr : new Error(String(syncErr));
            }

            clearTimers();

            if (evalResult && typeof evalResult === 'object' && 'error' in evalResult) {
              const err = (evalResult as { error: unknown }).error;
              result = {
                error: String(
                  err ? vm.dump(err as Parameters<typeof vm.dump>[0]) : 'Unknown error',
                ),
              };
            } else if (evalResult && typeof evalResult === 'object' && 'value' in evalResult) {
              const promiseHandle = (evalResult as { value: unknown }).value;
              if (!promiseHandle) {
                result = null;
              } else {
                let nativePromise: Promise<unknown>;
                try {
                  nativePromise = vm.resolvePromise(
                    promiseHandle as Parameters<typeof vm.resolvePromise>[0],
                  );
                  (promiseHandle as { dispose?: () => void }).dispose?.();
                  runtime.executePendingJobs();
                } catch (syncErr) {
                  throw syncErr instanceof Error ? syncErr : new Error(String(syncErr));
                }

                const resolveRaceTargets: Promise<unknown>[] = [nativePromise, timeoutPromise];
                if (abortPromise !== null) resolveRaceTargets.push(abortPromise);
                const resolvedResult = await Promise.race(resolveRaceTargets);
                clearTimers();

                if (
                  resolvedResult &&
                  typeof resolvedResult === 'object' &&
                  'error' in resolvedResult
                ) {
                  const err = (resolvedResult as { error: unknown }).error;
                  result = {
                    error: String(
                      err ? vm.dump(err as Parameters<typeof vm.dump>[0]) : 'Unknown error',
                    ),
                  };
                } else if (
                  resolvedResult &&
                  typeof resolvedResult === 'object' &&
                  'value' in resolvedResult
                ) {
                  const valueHandle = (resolvedResult as { value: unknown }).value;
                  result = valueHandle
                    ? vm.dump(valueHandle as Parameters<typeof vm.dump>[0])
                    : null;
                  (valueHandle as { dispose?: () => void } | null)?.dispose?.();
                } else {
                  result = null;
                }
              }
            } else {
              result = null;
            }
          } catch (err) {
            clearTimers();
            result = timedOut
              ? { error: `Execution timed out after ${timeoutMs}ms` }
              : { error: err instanceof Error ? err.message : String(err) };
          }

          if (result && typeof result === 'object' && '__codeError' in result) {
            result = { error: (result as { __codeError: string }).__codeError };
          }

          return { result, logs };
        },

        dispose() {
          runtimeAlive = false;
          try {
            vm.dispose();
          } catch {
            /* ignore WASM errors on teardown */
          }
          try {
            runtime.dispose();
          } catch {
            /* ignore WASM errors on teardown */
          }
        },
      };
    },
  };
}
