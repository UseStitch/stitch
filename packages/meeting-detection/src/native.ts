import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type NativeWatchRow = { pid: number; processName: string; windowTitle?: string };

export type NativeWatchEvent = { kind: 'snapshot' | 'error'; rows?: NativeWatchRow[]; message?: string };

type NativeAddon = {
  startWatcher: (callback: (err: Error | null, event: NativeWatchEvent) => void) => void;
  stopWatcher: () => void;
};

const require = createRequire(import.meta.url);

const BINDING_FILE = 'binding.cjs';

function resolveBindingPath(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const packagedBinding = path.join(resourcesPath, 'meeting-detection', BINDING_FILE);
    if (existsSync(packagedBinding)) {
      return packagedBinding;
    }
  }

  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Unbundled: native/ sits next to src/ in this package.
    path.join(sourceDir, '../native', BINDING_FILE),
    // Bundled into the Electron main process (apps/desktop/out/main/index.js):
    // resolve the addon from the workspace package in development.
    path.join(sourceDir, '../../../../packages/meeting-detection/native', BINDING_FILE),
    path.join(sourceDir, '../../../../../packages/meeting-detection/native', BINDING_FILE),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

// oxlint-disable-next-line no-dynamic-require -- the binding path is resolved at runtime (dev vs packaged resources)
const native = require(resolveBindingPath()) as NativeAddon;

export const startWatcher = native.startWatcher;
export const stopWatcher = native.stopWatcher;
