export const label = 'sample-library';

export function double(value: number): number {
  return value * 2;
}

export function canReadFunctionPrototype(): boolean {
  return Object.hasOwn(globalThis.Function, 'prototype');
}

export function hasGlobalSampleWorker(): boolean {
  return Object.hasOwn(globalThis, 'sampleGlobal');
}
