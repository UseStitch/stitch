import { SandboxSecurityError } from './errors.js';

const DANGEROUS_GLOBALS = [
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
] as const;

const AsyncFunction = async function sandboxAsyncFunction() {
  return undefined;
}.constructor;
const GeneratorFunction = function* sandboxGeneratorFunction() {
  yield undefined;
  return undefined;
}.constructor;
const AsyncGeneratorFunction = async function* sandboxAsyncGeneratorFunction() {
  yield undefined;
  return undefined;
}.constructor;

const CONSTRUCTOR_PROPERTY_TARGETS = [
  Object,
  Array,
  Function,
  AsyncFunction,
  GeneratorFunction,
  AsyncGeneratorFunction,
  String,
  Number,
  Boolean,
  RegExp,
  Error,
  Promise,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Date,
] as const;

const FROZEN_PROTOTYPE_CONSTRUCTORS = CONSTRUCTOR_PROPERTY_TARGETS.filter((ctor) => ctor !== Error);
const FUNCTION_FACADE = Object.freeze({ prototype: Function.prototype });
const ALLOWED_DYNAMIC_IMPORTS = new Set(['node:fs', 'node:fs/promises']);

function assertSafeDynamicImports(code: string): void {
  const dynamicImports = code.matchAll(/\bimport\s*\(([^)]*)\)/g);

  for (const match of dynamicImports) {
    const specifier = match[1]?.trim();
    const literal = specifier?.match(/^['"]([^'"]+)['"]$/);
    if (!literal || !ALLOWED_DYNAMIC_IMPORTS.has(literal[1])) {
      throw new SandboxSecurityError(
        'dynamic import is only available for node:fs and node:fs/promises',
      );
    }
  }
}

function removeGlobal(name: string): void {
  try {
    Object.defineProperty(globalThis, name, {
      value: undefined,
      writable: false,
      configurable: false,
    });
  } catch {
    try {
      delete (globalThis as Record<string, unknown>)[name];
    } catch {
      // Best effort for non-configurable host globals.
    }
  }
}

function removePrototypeConstructor(ctor: { prototype?: object }): void {
  if (!ctor.prototype) return;
  try {
    Object.defineProperty(ctor.prototype, 'constructor', {
      value: undefined,
      writable: false,
      configurable: false,
    });
  } catch {
    // Ignore non-configurable built-ins.
  }
}

export function harden(): void {
  for (const name of DANGEROUS_GLOBALS) removeGlobal(name);
  Object.defineProperty(globalThis, 'Function', {
    value: FUNCTION_FACADE,
    writable: false,
    configurable: false,
  });

  for (const ctor of CONSTRUCTOR_PROPERTY_TARGETS) {
    removePrototypeConstructor(ctor);
  }

  for (const ctor of FROZEN_PROTOTYPE_CONSTRUCTORS) {
    Object.freeze(ctor.prototype);
    Object.freeze(ctor);
  }

  Object.freeze(JSON);
  Object.freeze(Math);
}

export function assertSafeCode(code: string): void {
  const forbiddenPatterns: Array<[RegExp, string]> = [
    [/^\s*import\s/m, 'import declarations are not available in the sandbox'],
    [/^\s*export\s/m, 'export declarations are not available in the sandbox'],
  ];

  assertSafeDynamicImports(code);

  for (const [pattern, message] of forbiddenPatterns) {
    if (pattern.test(code)) throw new SandboxSecurityError(message);
  }
}
