import { SandboxError, SandboxToolError } from './errors.js';
import { assertSafeCode, harden } from './hardening.js';
import { ERROR_KEYS } from './types.js';

import type { WorkerMessage } from './protocol.js';
import type { SandboxLibrary } from './types.js';

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

type InitData = {
  toolNames?: string[];
  libraries?: Record<string, SandboxLibrary>;
  memoryReportIntervalMs?: number;
};

/**
 * Starts the sandbox process runtime. Call this from a process entry file.
 * Communicates with the host via Bun IPC (process.send / process.on("message")).
 *
 * @param preloadedModules - A map of library specifiers to already-imported module namespaces.
 *   When running inside a compiled binary, libraries are statically imported by the entry
 *   and passed here so no dynamic import is needed at runtime.
 */
export function startProcessRuntime(
  preloadedModules: Record<string, Record<string, unknown>> = {},
): void {
  if (typeof process.send !== 'function') {
    throw new SandboxError('sandbox process requires IPC channel (process.send)');
  }

  // Capture IPC primitives before harden() removes `process` from globalThis.
  const ipcSend = process.send.bind(process) as (message: unknown) => void;
  const ipcOn = process.on.bind(process) as (
    event: string,
    listener: (message: unknown) => void,
  ) => void;
  const getMemoryUsage = process.memoryUsage.bind(process) as () => NodeJS.MemoryUsage;

  const pendingCalls = new Map<string, PendingCall>();
  let logs: string[] = [];
  const SandboxFunction = Function;
  const importLibrary = new SandboxFunction('specifier', 'return import(specifier);') as (
    specifier: string,
  ) => Promise<Record<string, unknown>>;
  let injectedLibraries: Record<string, unknown> = {};
  let toolNames: string[] = [];
  let libraries: Record<string, SandboxLibrary> = {};

  function post(message: WorkerMessage): void {
    ipcSend(message);
  }

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

  async function loadLibraries(): Promise<Record<string, unknown>> {
    const entries: Array<readonly [string, unknown]> = [];
    await Promise.all(
      Object.entries(libraries).map(async ([name, library]) => {
        const preloaded = preloadedModules[library.specifier];
        const moduleNamespace = preloaded ?? (await importLibrary(library.specifier));
        const exposedLibrary = Object.freeze({ ...moduleNamespace });
        if (library.globalName !== undefined) {
          Object.defineProperty(globalThis, library.globalName, {
            value: exposedLibrary,
            writable: false,
            configurable: false,
          });
        }
        if (library.inject !== false) entries.push([name, exposedLibrary] as const);
      }),
    );

    return Object.fromEntries(entries);
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
      const libraryNames = Object.keys(injectedLibraries);
      const libraryValues = libraryNames.map((n) => injectedLibraries[n]);
      const execute = new SandboxFunction(
        'console',
        ...hiddenGlobalNames,
        ...libraryNames,
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
      ) as (console: Console, ...args: unknown[]) => Promise<unknown>;

      let result = await execute(
        sandboxConsole,
        ...hiddenGlobalNames.map(() => undefined),
        ...libraryValues,
      );
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

  async function initialize(initData: InitData): Promise<void> {
    toolNames = initData.toolNames ?? [];
    libraries = initData.libraries ?? {};
    injectedLibraries = await loadLibraries();
    // Pre-import allowed modules before hardening freezes globals.
    await importLibrary('node:fs');
    await importLibrary('node:fs/promises');
    harden();
    registerToolProxies();

    // Start periodic RSS reporting after hardening (uses pre-captured references).
    const intervalMs = initData.memoryReportIntervalMs;
    if (intervalMs && intervalMs > 0) {
      setInterval(() => {
        const { rss } = getMemoryUsage();
        ipcSend({ type: 'memory_report', rss });
      }, intervalMs);
    }
  }

  let initialization: Promise<void> | null = null;

  ipcOn('message', (message) => {
    if (message === null || typeof message !== 'object') return;
    const msg = message as {
      type?: string;
      id?: string;
      result?: unknown;
      error?: string;
      code?: string;
      toolNames?: string[];
      libraries?: Record<string, SandboxLibrary>;
      memoryReportIntervalMs?: number;
    };

    if (msg.type === 'init') {
      initialization = initialize({
        toolNames: msg.toolNames,
        libraries: msg.libraries,
        memoryReportIntervalMs: msg.memoryReportIntervalMs,
      });
      initialization.catch((err) => {
        post({ type: 'error', error: err instanceof Error ? err.message : String(err), logs });
      });
      return;
    }

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
      const ready = initialization ?? Promise.resolve();
      void ready
        .then(() => executeCode(msg.code as string))
        .catch((err) => {
          post({ type: 'error', error: err instanceof Error ? err.message : String(err), logs });
        });
    }
  });
}
