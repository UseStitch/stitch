export const label = 'sample-library';

export function double(value: number): number {
  return value * 2;
}

export function canReadFunctionPrototype(): boolean {
  return typeof globalThis.Function?.prototype === 'function';
}

export function hasGlobalSampleWorker(): boolean {
  return typeof (globalThis as { sampleGlobal?: unknown }).sampleGlobal === 'object';
}
