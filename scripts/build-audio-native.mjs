import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const crateManifestPath = join(repoRoot, 'native/Cargo.toml');
const stageDir = join(repoRoot, 'native/target/release');

function resolveDefaultTarget() {
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return 'aarch64-apple-darwin';
  }


  if (process.platform === 'win32' && process.arch === 'x64') {
    return 'x86_64-pc-windows-msvc';
  }

  throw new Error(
    `Unsupported local platform/arch for native audio build: ${process.platform}/${process.arch}`,
  );
}

function parseTarget() {
  const argTarget = process.argv.slice(2).find((arg) => arg.startsWith('--target='));
  if (argTarget) {
    return argTarget.split('=')[1];
  }

  return process.env.STITCH_AUDIO_NATIVE_TARGET || resolveDefaultTarget();
}

function resolveBinaryName(target) {
  return target.includes('windows') ? 'stitch-audio-capture.exe' : 'stitch-audio-capture';
}

const target = parseTarget();
const binaryName = resolveBinaryName(target);

const build = spawnSync(
  'cargo',
  [
    'build',
    '--release',
    '--target',
    target,
    '--manifest-path',
    crateManifestPath,
    '-p',
    'stitch-audio-capture',
    '--bins',
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  },
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const builtBinary = join(repoRoot, `native/target/${target}/release/${binaryName}`);
if (!existsSync(builtBinary)) {
  throw new Error(`Native audio binary was not found at ${builtBinary}`);
}

mkdirSync(stageDir, { recursive: true });
const stagedBinary = join(stageDir, binaryName);
copyFileSync(builtBinary, stagedBinary);

console.log(`Staged ${binaryName} -> ${stagedBinary}`);
