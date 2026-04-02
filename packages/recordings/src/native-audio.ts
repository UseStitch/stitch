/**
 * Native audio binding loader.
 *
 * Bun's --compile cannot bundle native .node addons loaded via dynamic
 * createRequire() patterns when using require(). However, dynamic import()
 * with an absolute path DOES work from compiled binaries. When running as a
 * compiled binary, we use import() to load native-audio-node from a
 * node_modules directory shipped next to the binary.
 */

import { dirname, join } from 'node:path';

import type * as NativeAudioTypes from 'native-audio-node';

type NativeAudioModule = typeof NativeAudioTypes;

function isCompiledBinary(): boolean {
  // In a Bun compiled binary, process.versions.bun exists but process.execPath
  // points to the compiled binary itself (not the bun runtime).
  // In dev (bun run), process.execPath contains 'bun'.
  // In test (vitest/node), process.versions.bun is undefined.
  return 'bun' in process.versions && !process.execPath.includes('bun');
}

async function loadModule(): Promise<NativeAudioModule> {
  if (isCompiledBinary()) {
    const modulePath = join(
      dirname(process.execPath),
      'node_modules',
      'native-audio-node',
      'dist',
      'index.js',
    );
    return import(modulePath);
  }

  return require('native-audio-node');
}

const mod = await loadModule();

export const MicrophoneActivityMonitor = mod.MicrophoneActivityMonitor;
export type MicrophoneActivityMonitor = NativeAudioTypes.MicrophoneActivityMonitor;

export const MicrophoneRecorder = mod.MicrophoneRecorder;
export type MicrophoneRecorder = NativeAudioTypes.MicrophoneRecorder;

export const SystemAudioRecorder = mod.SystemAudioRecorder;
export type SystemAudioRecorder = NativeAudioTypes.SystemAudioRecorder;
