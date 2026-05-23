import type { QuickJSAsyncContext, QuickJSHandle } from 'quickjs-emscripten-core';

import { ERROR_KEYS } from '@/code-mode/isolate/types.js';
import type { ToolBinding } from '@/code-mode/isolate/types.js';

import type { PausableTimer } from '@/code-mode/isolate/execution-timer.js';
import { wrapWithPausableTimeout } from '@/code-mode/isolate/execution-timer.js';

// Cap per-tool-result JSON at 512 KB before it enters the WASM heap
const MAX_RESULT_BYTES = 512 * 1024;

export function setupConsole(vm: QuickJSAsyncContext, logs: string[]): void {
  const consoleHandle = vm.newObject();
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const fn = vm.newFunction(level, (...args: QuickJSHandle[]) => {
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
}

export function registerBindings(
  vm: QuickJSAsyncContext,
  bindings: Record<string, ToolBinding>,
  timer: PausableTimer,
  toolTimeoutMs: number,
  abortSignal: AbortSignal | undefined,
  isRuntimeAlive: () => boolean,
): void {
  for (const [name, binding] of Object.entries(bindings)) {
    const wrappedExecute = wrapWithPausableTimeout(
      binding.execute,
      timer,
      toolTimeoutMs,
      abortSignal,
    );

    const fn = vm.newAsyncifiedFunction(name, async (inputHandle: QuickJSHandle) => {
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
        if (!isRuntimeAlive()) return vm.undefined;
        return vm.newString(JSON.stringify({ [ERROR_KEYS.TOOL_ERROR]: message }));
      }

      if (!isRuntimeAlive()) return vm.undefined;

      try {
        let serialized = JSON.stringify(result ?? null);
        if (serialized.length > MAX_RESULT_BYTES) {
          serialized = serialized.slice(0, MAX_RESULT_BYTES) + '…[truncated]"';
        }
        return vm.newString(serialized);
      } catch {
        return vm.newString(JSON.stringify({ [ERROR_KEYS.TOOL_ERROR]: 'Result could not be serialized' }));
      }
    });

    vm.setProp(vm.global, name, fn);
    fn.dispose();
  }
}

export function registerParseResult(vm: QuickJSAsyncContext): void {
  const parseResultFn = vm.newFunction('__parseResult', (jsonHandle: QuickJSHandle) => {
    const json = vm.dump(jsonHandle) as string;
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === 'object' && ERROR_KEYS.TOOL_ERROR in parsed) {
        throw new Error(String(parsed[ERROR_KEYS.TOOL_ERROR]));
      }
      return vm.newString(JSON.stringify(parsed));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(message);
    }
  });
  vm.setProp(vm.global, '__parseResult', parseResultFn);
  parseResultFn.dispose();
}
