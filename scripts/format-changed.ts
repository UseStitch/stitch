#!/usr/bin/env bun
import { spawnSync } from 'bun';

const checkOnly = process.argv.includes('--check');

const result = spawnSync(['git', 'diff', '--name-only', 'HEAD'], {
  stdout: 'pipe',
  stderr: 'pipe',
});

const files = result.stdout
  .toString()
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);

if (files.length === 0) process.exit(0);

const cmd = checkOnly ? ['oxfmt', 'check', ...files] : ['oxfmt', 'write', ...files];

const fmt = spawnSync(cmd, { stdout: 'inherit', stderr: 'inherit' });
process.exit(fmt.exitCode ?? 0);
