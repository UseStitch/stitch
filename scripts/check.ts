#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'knip', cmd: 'bunx', args: ['knip', '--fix', '--allow-remove-files'] },
  { name: 'typecheck', cmd: 'bun', args: ['run', 'typecheck'] },
  { name: 'test', cmd: 'bun', args: ['run', '--filter', '*', 'test'] },
  {
    name: 'lint',
    cmd: 'bunx',
    args: ['oxlint', '--config', 'oxlint.json', '--fix', '--fix-suggestions', '.'],
  },
  {
    name: 'lint:check',
    cmd: 'bunx',
    args: ['oxlint', '--config', 'oxlint.json', '--deny-warnings', '.'],
  },
  { name: 'catalogs', cmd: 'tsx', args: ['scripts/check-catalogs.ts'] },
  {
    name: 'format:changed:check',
    cmd: 'bun',
    args: ['run', 'format:changed:check'],
  },
];

for (const step of steps) {
  const result = spawnSync(step.cmd, step.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'buffer',
  });
  const output = Buffer.concat([
    result.stdout ?? Buffer.alloc(0),
    result.stderr ?? Buffer.alloc(0),
  ]).toString();

  if (result.status !== 0) {
    console.log(`${step.name}: Fail`);
    console.log(output);
    process.exit(1);
  } else {
    console.log(`${step.name}: Pass`);
  }
}

process.exit(0);
