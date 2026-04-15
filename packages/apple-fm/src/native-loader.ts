import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NativeBindings } from './apple-fm-types.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const nativeRequire = createRequire(import.meta.url);

function loadNativeModule(): NativeBindings {
  const possiblePaths = [
    resolve(currentDir, '../build/apple_fm_napi.node'),
    resolve(currentDir, '../../build/apple_fm_napi.node'),
    resolve(currentDir, '../native/target/release/apple_fm_napi.node'),
    resolve(process.cwd(), 'build/apple_fm_napi.node'),
  ];

  const existingPath = possiblePaths.find((path) => {
    try {
      return existsSync(path);
    } catch {
      return false;
    }
  });

  if (existingPath) {
    try {
      return nativeRequire(existingPath) as NativeBindings;
    } catch {
      // fall through
    }
  }

  for (const path of possiblePaths) {
    try {
      return nativeRequire(path) as NativeBindings;
    } catch {
      // fall through
    }
  }

  const searchedPaths = possiblePaths
    .map((p) => `  - ${p} ${existsSync(p) ? '(exists)' : '(not found)'}`)
    .join('\n');

  throw new Error(
    [
      'Failed to load apple_fm_napi native module.',
      `Searched paths:\n${searchedPaths}`,
      `Platform: ${process.platform} ${process.arch}`,
      'This package requires macOS 26+ on Apple Silicon (ARM64).',
    ].join('\n'),
  );
}

let nativeModule: NativeBindings | null = null;

export function getNativeModule(): NativeBindings {
  if (!nativeModule) {
    nativeModule = loadNativeModule();
  }
  return nativeModule;
}
