import { newQuickJSAsyncWASMModule } from 'quickjs-emscripten';

import type { IsolateContext, IsolateDriver, IsolateExecuteResult, IsolateOptions, ToolBinding } from '@/code-mode/isolate/types.js';

const DEFAULT_MEMORY_LIMIT_MB = 128;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_STACK_SIZE = 1024 * 1024;
// Cap per-tool-result JSON at 512 KB before it enters the WASM heap
const MAX_RESULT_BYTES = 512 * 1024;

function wrapWithPausableTimeout(
  execute: (input: unknown) => Promise<unknown>,
  pauseTimer: () => void,
  resumeTimer: () => void,
): (input: unknown) => Promise<unknown> {
  return async (input) => {
    pauseTimer();
    try {
      return await execute(input);
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

      const module = await newQuickJSAsyncWASMModule();
      const runtime = module.newRuntime();
      runtime.setMemoryLimit(memoryLimitMb * 1024 * 1024);
      runtime.setMaxStackSize(MAX_STACK_SIZE);

      const vm = runtime.newContext();
      const logs: string[] = [];

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
        const wrappedExecute = wrapWithPausableTimeout(binding.execute, pauseTimer, resumeTimer);

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
            return vm.newString(JSON.stringify({ __error: message }));
          }

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
          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          let timedOut = false;

          const timeoutPromise = new Promise<never>((_, reject) => {
            const check = () => {
              const paused = pausedAt !== null ? Date.now() - pausedAt : 0;
              const elapsed = Date.now() - startedAt - totalPausedMs - paused;
              if (elapsed >= timeoutMs) {
                timedOut = true;
                reject(new Error(`Code mode execution timed out after ${timeoutMs}ms`));
              } else {
                timeoutId = setTimeout(check, 100);
              }
            };
            timeoutId = setTimeout(check, 100);
          });

          let result: unknown;
          try {
            const evalResult = await Promise.race([vm.evalCodeAsync(wrappedCode), timeoutPromise]);

            if (timeoutId !== null) clearTimeout(timeoutId);

            if (evalResult && typeof evalResult === 'object' && 'error' in evalResult) {
              const err = evalResult.error;
              result = { error: String(err ? vm.dump(err) : 'Unknown error') };
            } else if (evalResult && typeof evalResult === 'object' && 'value' in evalResult) {
              const promiseHandle = evalResult.value;
              if (!promiseHandle) {
                result = null;
              } else {
                const nativePromise = vm.resolvePromise(promiseHandle);
                promiseHandle.dispose();
                runtime.executePendingJobs();

                const resolvedResult = await Promise.race([nativePromise, timeoutPromise]);
                if (timeoutId !== null) clearTimeout(timeoutId);

                if (resolvedResult && typeof resolvedResult === 'object' && 'error' in resolvedResult) {
                  const err = resolvedResult.error;
                  result = { error: String(err ? vm.dump(err) : 'Unknown error') };
                } else if (resolvedResult && typeof resolvedResult === 'object' && 'value' in resolvedResult) {
                  const valueHandle = resolvedResult.value;
                  result = valueHandle ? vm.dump(valueHandle) : null;
                  valueHandle?.dispose();
                } else {
                  result = null;
                }
              }
            } else {
              result = null;
            }
          } catch (err) {
            if (timeoutId !== null) clearTimeout(timeoutId);
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
          try { vm.dispose(); } catch { /* ignore */ }
          try { runtime.dispose(); } catch { /* ignore */ }
        },
      };
    },
  };
}
