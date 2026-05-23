import quickJSVariant from '@jitl/quickjs-singlefile-mjs-release-asyncify';
import { isFail, newQuickJSAsyncWASMModuleFromVariant } from 'quickjs-emscripten-core';

import {
  createAbortRace,
  createExecutionTimeoutRace,
  createPausableTimer,
} from '@/code-mode/isolate/execution-timer.js';
import {
  registerBindings,
  registerParseResult,
  setupConsole,
} from '@/code-mode/isolate/quickjs-vm-setup.js';
import type {
  IsolateContext,
  IsolateDriver,
  IsolateExecuteResult,
  IsolateOptions,
  ToolBinding,
} from '@/code-mode/isolate/types.js';
import { ERROR_KEYS } from '@/code-mode/isolate/types.js';
import type { QuickJSAsyncContext, QuickJSHandle, SuccessOrFail } from 'quickjs-emscripten-core';

const DEFAULT_MEMORY_LIMIT_MB = 128;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_STACK_SIZE = 512 * 1024;
// Per-tool call timeout: slightly under the sandbox timeout so a hung tool
// unblocks before the outer timer fires
const TOOL_TIMEOUT_BUFFER_MS = 5_000;

// --- Eval result unwrapping ---

function dumpError(vm: QuickJSAsyncContext, err: QuickJSHandle): string {
  return String(err ? vm.dump(err) : 'Unknown error');
}

async function unwrapEvalResult(
  vm: QuickJSAsyncContext,
  evalResult: unknown,
  abortPromise: Promise<never> | null,
): Promise<unknown> {
  // evalCodeAsync returns DisposableResult<QuickJSHandle, QuickJSHandle> which implements SuccessOrFail.
  // Cast to the discriminated union so isFail can narrow properly.
  const result = evalResult as SuccessOrFail<QuickJSHandle, QuickJSHandle>;

  if (isFail(result)) {
    const errorMsg = dumpError(vm, result.error);
    result.error.dispose();
    return { error: errorMsg };
  }

  const promiseHandle = result.value;
  if (!promiseHandle) {
    return null;
  }

  let nativePromise: Promise<unknown>;
  try {
    nativePromise = vm.resolvePromise(promiseHandle);
    promiseHandle.dispose();
    vm.runtime.executePendingJobs();
  } catch (syncErr) {
    throw syncErr instanceof Error ? syncErr : new Error(String(syncErr));
  }

  const raceTargets: Promise<unknown>[] = [nativePromise];
  if (abortPromise !== null) raceTargets.push(abortPromise);
  const resolvedResult = (await Promise.race(raceTargets)) as SuccessOrFail<
    QuickJSHandle,
    QuickJSHandle
  >;

  if (isFail(resolvedResult)) {
    const errorMsg = dumpError(vm, resolvedResult.error);
    resolvedResult.error.dispose();
    return { error: errorMsg };
  }

  const valueHandle = resolvedResult.value;
  const dumped = valueHandle ? vm.dump(valueHandle) : null;
  valueHandle?.dispose();
  return dumped;
}

// --- Main driver ---

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

      const timer = createPausableTimer();

      setupConsole(vm, logs);
      registerBindings(vm, bindings, timer, toolTimeoutMs, abortSignal, () => runtimeAlive);
      registerParseResult(vm);

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
          const timeoutRace = createExecutionTimeoutRace(timer, startedAt, timeoutMs);
          const abortPromise = createAbortRace(abortSignal, 'Code mode execution aborted');

          let result: unknown;
          try {
            const evalPromise = vm.evalCodeAsync(wrappedCode);
            const raceTargets: Promise<unknown>[] = [evalPromise, timeoutRace.promise];
            if (abortPromise !== null) raceTargets.push(abortPromise);
            const evalResult = await Promise.race(raceTargets);

            timeoutRace.cleanup();
            result = await unwrapEvalResult(vm, evalResult, abortPromise);
          } catch (err) {
            timeoutRace.cleanup();
            result = timeoutRace.isTimedOut()
              ? { error: `Execution timed out after ${timeoutMs}ms` }
              : { error: err instanceof Error ? err.message : String(err) };
          }

          if (result && typeof result === 'object' && ERROR_KEYS.CODE_ERROR in result) {
            result = {
              error: (result as { [K in typeof ERROR_KEYS.CODE_ERROR]: string })[
                ERROR_KEYS.CODE_ERROR
              ],
            };
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
