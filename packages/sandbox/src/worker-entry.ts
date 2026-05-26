import { parentPort, workerData } from 'node:worker_threads';

import { SandboxError, SandboxToolError } from './errors.ts';
import { assertSafeCode, harden } from './hardening.ts';
import type { WorkerMessage } from './protocol.ts';
import { ERROR_KEYS } from './types.ts';

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

function getParentPort() {
  if (parentPort === null) throw new SandboxError('sandbox worker requires parentPort');
  return parentPort;
}

const port = getParentPort();

const data = workerData as { toolNames?: string[] } | undefined;
const toolNames = data?.toolNames ?? [];
const pendingCalls = new Map<string, PendingCall>();
let logs: string[] = [];
const SandboxFunction = Function;

function stringifyLogValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack ?? value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createConsole(): Console {
  const write = (level: string, values: unknown[]) => {
    logs.push(`[${level}] ${values.map(stringifyLogValue).join(' ')}`);
  };

  return {
    log: (...values: unknown[]) => write('log', values),
    info: (...values: unknown[]) => write('info', values),
    warn: (...values: unknown[]) => write('warn', values),
    error: (...values: unknown[]) => write('error', values),
    debug: (...values: unknown[]) => write('debug', values),
  } as Console;
}

function post(message: WorkerMessage): void {
  port.postMessage(message);
}

function createToolProxy(name: string): (args: unknown) => Promise<unknown> {
  return (args: unknown) => {
    const id = crypto.randomUUID();
    post({ type: 'tool_call', id, name, args });
    return new Promise((resolve, reject) => {
      pendingCalls.set(id, { resolve, reject });
    });
  };
}

function registerToolProxies(): void {
  for (const name of toolNames) {
    Object.defineProperty(globalThis, name, {
      value: createToolProxy(name),
      writable: false,
      configurable: false,
    });
  }
}

async function executeCode(code: string): Promise<void> {
  logs = [];
  const sandboxConsole = createConsole();

  try {
    assertSafeCode(code);
    const hiddenGlobalNames = [
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
    ];
    const execute = new SandboxFunction(
      'console',
      ...hiddenGlobalNames,
      `return (async () => {
        try {
          const __result = await (async () => {
            ${code}
          })();
          return __result;
        } catch (e) {
          return { ${JSON.stringify(ERROR_KEYS.CODE_ERROR)}: e && e.message ? e.message : String(e) };
        }
      })();`,
    ) as (console: Console, ...hiddenGlobals: undefined[]) => Promise<unknown>;

    let result = await execute(sandboxConsole, ...hiddenGlobalNames.map(() => undefined));
    if (result !== null && typeof result === 'object' && ERROR_KEYS.CODE_ERROR in result) {
      result = {
        error: (result as { [ERROR_KEYS.CODE_ERROR]: unknown })[ERROR_KEYS.CODE_ERROR],
      };
    }
    post({ type: 'complete', result, logs });
  } catch (err) {
    post({ type: 'error', error: err instanceof Error ? err.message : String(err), logs });
  }
}

harden();
registerToolProxies();

port.on('message', (message) => {
  if (message === null || typeof message !== 'object') return;
  const msg = message as { type?: string; id?: string; result?: unknown; error?: string; code?: string };

  if (msg.type === 'tool_result' && typeof msg.id === 'string') {
    pendingCalls.get(msg.id)?.resolve(msg.result);
    pendingCalls.delete(msg.id);
    return;
  }

  if (msg.type === 'tool_error' && typeof msg.id === 'string') {
    pendingCalls.get(msg.id)?.reject(new SandboxToolError(msg.error ?? 'Tool call failed'));
    pendingCalls.delete(msg.id);
    return;
  }

  if (msg.type === 'execute' && typeof msg.code === 'string') {
    void executeCode(msg.code);
  }
});
