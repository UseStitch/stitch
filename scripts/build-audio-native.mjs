import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const pkgDir = join(repoRoot, 'packages/audio-capture');

const result = spawnSync('bun', ['run', 'build'], { cwd: pkgDir, stdio: 'inherit', env: process.env });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
