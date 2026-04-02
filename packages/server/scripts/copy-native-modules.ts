/**
 * Copies native-audio-node and its platform-specific native addon into
 * dist/node_modules so the compiled sidecar binary can resolve them at runtime.
 *
 * Bun's --compile cannot embed native .node addons that are loaded via dynamic
 * require() patterns (like createRequire + platform detection). By externalizing
 * native-audio-node in the build and shipping its files alongside the binary,
 * the compiled executable resolves the module from disk via NODE_PATH.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const DIST_NODE_MODULES = resolve(import.meta.dirname, '../dist/node_modules');

const platform = process.platform;
const arch = process.arch;

const platformPackageMap: Record<string, Record<string, string>> = {
  darwin: {
    arm64: '@native-audio-node/darwin-arm64',
    x64: '@native-audio-node/darwin-x64',
  },
  win32: {
    x64: '@native-audio-node/win32-x64',
    arm64: '@native-audio-node/win32-arm64',
  },
};

const platformPackage = platformPackageMap[platform]?.[arch];
if (!platformPackage) {
  console.warn(`[copy-native-modules] No native-audio-node package for ${platform}-${arch}, skipping`);
  process.exit(0);
}

function findPackage(packageName: string): string | null {
  // Check recordings workspace node_modules (where it's actually installed)
  const recordingsNm = join(ROOT, 'packages/recordings/node_modules', packageName);
  if (existsSync(join(recordingsNm, 'package.json'))) {
    return recordingsNm;
  }

  // Check root node_modules
  const rootNm = join(ROOT, 'node_modules', packageName);
  if (existsSync(join(rootNm, 'package.json'))) {
    return rootNm;
  }

  // Check bun's internal module cache
  const bunModules = join(ROOT, 'node_modules/.bun');
  if (existsSync(bunModules)) {
    const slug = packageName.replace('@', '').replace('/', '+');
    const entries = readdirSync(bunModules);
    for (const entry of entries) {
      if (entry.startsWith(slug + '@') || entry.startsWith(packageName.replace('/', '+') + '@')) {
        const candidate = join(bunModules, entry, 'node_modules', packageName);
        if (existsSync(join(candidate, 'package.json'))) {
          return candidate;
        }
      }
    }

    // Also check the symlinked location
    const bunLinked = join(bunModules, 'node_modules', packageName);
    if (existsSync(join(bunLinked, 'package.json'))) {
      return bunLinked;
    }
  }

  return null;
}

const nativeAudioDir = findPackage('native-audio-node');
if (!nativeAudioDir) {
  console.error('[copy-native-modules] Could not find native-audio-node package');
  process.exit(1);
}

const platformDir = findPackage(platformPackage);
if (!platformDir) {
  console.error(`[copy-native-modules] Could not find ${platformPackage} package`);
  process.exit(1);
}

// Clean previous copy
if (existsSync(DIST_NODE_MODULES)) {
  rmSync(DIST_NODE_MODULES, { recursive: true });
}

// Copy native-audio-node JS package (dereference symlinks)
const destNativeAudio = join(DIST_NODE_MODULES, 'native-audio-node');
mkdirSync(destNativeAudio, { recursive: true });
cpSync(nativeAudioDir, destNativeAudio, { recursive: true, dereference: true });

// Copy platform-specific native addon package (dereference symlinks)
const destPlatform = join(DIST_NODE_MODULES, platformPackage);
mkdirSync(dirname(destPlatform), { recursive: true });
cpSync(platformDir, destPlatform, { recursive: true, dereference: true });

console.log(`[copy-native-modules] Copied native-audio-node -> ${destNativeAudio}`);
console.log(`[copy-native-modules] Copied ${platformPackage} -> ${destPlatform}`);

// Patch native-audio-node/dist/index.js: Bun's createRequire does not resolve
// the "main" field from package.json for .node files. We append the explicit
// filename so the require call resolves directly to the native addon.
const indexJsPath = join(destNativeAudio, 'dist', 'index.js');
let indexJs = readFileSync(indexJsPath, 'utf8');
indexJs = indexJs.replace(
  'cachedBinding = require2(packageName)',
  'cachedBinding = require2(packageName + "/native_audio.node")',
);
writeFileSync(indexJsPath, indexJs);
console.log(`[copy-native-modules] Patched ${indexJsPath} for Bun .node resolution`);
