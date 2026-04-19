#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';

const checkOnly = process.argv.includes('--check');

const result = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  encoding: 'utf8',
});

const files = (result.stdout ?? '')
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);

if (files.length === 0) process.exit(0);

const args = checkOnly ? ['check', ...files] : ['write', ...files];

const fmt = spawnSync('oxfmt', args, { stdio: 'inherit' });
process.exit(fmt.status ?? 0);
