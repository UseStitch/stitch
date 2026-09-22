import { SandboxError, toErrorMessage } from './errors.js';
import { assertSafeCode, DANGEROUS_GLOBALS, harden } from './hardening.js';
import { isHostMessage, prepareHostMessageParser } from './protocol.js';

import type { HostMessage, WorkerMessage } from './protocol.js';
import type { SandboxValue } from './types.js';

/** Global names shadowed as `undefined` in sandbox function params (includes 'Function'). */
const HIDDEN_GLOBAL_NAMES: readonly string[] = [...DANGEROUS_GLOBALS, 'Function'];
const HIDDEN_GLOBAL_VALUES: readonly undefined[] = HIDDEN_GLOBAL_NAMES.map(() => undefined);

type PendingCall = { resolve: (value: SandboxValue) => void; reject: (reason: Error) => void };
type ModuleNamespace = object;
type SandboxConsole = {
  log: (...values: SandboxValue[]) => void;
  info: (...values: SandboxValue[]) => void;
  warn: (...values: SandboxValue[]) => void;
  error: (...values: SandboxValue[]) => void;
  debug: (...values: SandboxValue[]) => void;
};

type InitMessage = Extract<HostMessage, { type: 'init' }>;

/**
 * Starts the sandbox process runtime. Call this from a process entry file.
 * Communicates with the host via Bun IPC (process.send / process.on("message")).
 *
 * @param preloadedModules - A map of library specifiers to already-imported module namespaces.
 *   When running inside a compiled binary, libraries are statically imported by the entry
 *   and passed here so no dynamic import is needed at runtime.
 */
export function startProcessRuntime(preloadedModules: ReadonlyMap<string, ModuleNamespace> = new Map()): void {
  const sandboxProcess = process;
  if (!sandboxProcess.send) {
    throw new SandboxError('sandbox process requires IPC channel (process.send)');
  }

  // Capture IPC primitives before harden() removes `process` from globalThis.
  const ipcSend = (message: HostMessage | WorkerMessage) => sandboxProcess.send?.(message);
  const ipcOn = (listener: (message: SandboxValue) => void) => sandboxProcess.on('message', listener);
  const getMemoryUsage = () => sandboxProcess.memoryUsage();

  const pendingCalls = new Map<string, PendingCall>();
  let logs: string[] = [];
  const SandboxFunction = Function;
  const importLibrary = (specifier: string): Promise<ModuleNamespace> =>
    Promise.resolve(SandboxFunction('specifier', 'return import(specifier);')(specifier));
  let injectedLibraries = new Map<string, ModuleNamespace>();
  let toolNames: string[] = [];
  let libraries: InitMessage['libraries'] = {};

  function post(message: WorkerMessage): void {
    ipcSend(message);
  }

  function stringifyLogValue(value: SandboxValue): string {
    if (value === undefined) return 'undefined';
    if (Error.isError(value)) return value.stack ?? value.message;
    try {
      const serialized = JSON.stringify(value);
      return serialized.startsWith('"') ? JSON.parse(serialized) : serialized;
    } catch {
      return '[unserializable]';
    }
  }

  function createConsole(): SandboxConsole {
    const write = (level: string, values: SandboxValue[]) => {
      logs.push(`[${level}] ${values.map(stringifyLogValue).join(' ')}`);
    };

    return {
      log: (...values: SandboxValue[]) => write('log', values),
      info: (...values: SandboxValue[]) => write('info', values),
      warn: (...values: SandboxValue[]) => write('warn', values),
      error: (...values: SandboxValue[]) => write('error', values),
      debug: (...values: SandboxValue[]) => write('debug', values),
    };
  }

  function createToolProxy(name: string): (args: SandboxValue) => Promise<SandboxValue> {
    return (args: SandboxValue) => {
      const id = crypto.randomUUID();
      post({ type: 'tool_call', id, name, args });
      return new Promise((resolve, reject) => {
        pendingCalls.set(id, { resolve, reject });
      });
    };
  }

  function registerToolProxies(): void {
    for (const name of toolNames) {
      Object.defineProperty(globalThis, name, { value: createToolProxy(name), writable: false, configurable: false });
    }
  }

  async function loadLibraries(): Promise<Map<string, ModuleNamespace>> {
    const entries: Array<readonly [string, ModuleNamespace]> = [];
    await Promise.all(
      Object.entries(libraries).map(async ([name, library]) => {
        const preloaded = preloadedModules.get(library.specifier);
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

    return new Map(entries);
  }

  async function executeCode(code: string): Promise<void> {
    logs = [];
    const sandboxConsole = createConsole();

    try {
      assertSafeCode(code);
      const libraryNames = [...injectedLibraries.keys()];
      const libraryValues = [...injectedLibraries.values()];
      const execute = new SandboxFunction(
        'console',
        ...HIDDEN_GLOBAL_NAMES,
        ...libraryNames,
        `return (async () => {
          ${code}
        })();`,
      );

      const result = await execute(sandboxConsole, ...HIDDEN_GLOBAL_VALUES, ...libraryValues);
      post({ type: 'complete', result, logs });
    } catch (err) {
      post({ type: 'error', error: toErrorMessage(Error.isError(err) ? err : String(err)), logs });
    }
  }

  async function initialize(initData: InitMessage): Promise<void> {
    toolNames = initData.toolNames;
    libraries = initData.libraries;
    injectedLibraries = await loadLibraries();
    // Pre-import allowed modules before hardening freezes globals.
    await Promise.all([importLibrary('node:fs'), importLibrary('node:fs/promises')]);
    // Zod compiles protocol parsers with Function on first use.
    prepareHostMessageParser();
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

  function handleInit(data: InitMessage): void {
    initialization = initialize(data);
    initialization.catch((err) => {
      post({ type: 'error', error: toErrorMessage(Error.isError(err) ? err : String(err)), logs });
    });
  }

  function handleToolResult(msg: Extract<HostMessage, { type: 'tool_result' }>): void {
    pendingCalls.get(msg.id)?.resolve(msg.result);
    pendingCalls.delete(msg.id);
  }

  function handleToolError(msg: Extract<HostMessage, { type: 'tool_error' }>): void {
    pendingCalls.get(msg.id)?.reject(new SandboxError(msg.error));
    pendingCalls.delete(msg.id);
  }

  function handleExecute(msg: Extract<HostMessage, { type: 'execute' }>): void {
    const ready = initialization ?? Promise.resolve();
    void ready
      .then(() => executeCode(msg.code))
      .catch((err) => {
        post({ type: 'error', error: toErrorMessage(Error.isError(err) ? err : String(err)), logs });
      });
  }

  ipcOn((message: SandboxValue) => {
    if (!isHostMessage(message)) return;

    switch (message.type) {
      case 'init':
        handleInit(message);
        break;
      case 'tool_result':
        handleToolResult(message);
        break;
      case 'tool_error':
        handleToolError(message);
        break;
      case 'execute':
        handleExecute(message);
        break;
    }
  });
}
