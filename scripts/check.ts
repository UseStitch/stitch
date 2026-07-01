#!/usr/bin/env bun
import { spawnSync } from 'bun';

const steps = [
  { name: 'knip', cmd: ['bunx', 'knip', '--fix', '--allow-remove-files'] },
  { name: 'typecheck', cmd: ['bun', 'run', 'typecheck'] },
  { name: 'test', cmd: ['bun', 'run', 'test'] },
  {
    name: 'lint',
    cmd: [
      'bunx',
      'oxlint',
      '--config',
      'oxlint.json',
      '--type-aware',
      '--fix',
      '--fix-suggestions',
      '.',
    ],
  },
  {
    name: 'lint:check',
    cmd: ['bunx', 'oxlint', '--config', 'oxlint.json', '--type-aware', '--deny-warnings', '.'],
  },
  { name: 'catalogs', cmd: ['bun', 'run', 'scripts/check-catalogs.ts'] },
  {
    name: 'format:changed:check',
    cmd: ['bun', 'run', 'format:changed:check'],
  },
];

for (const step of steps) {
  const result = spawnSync(step.cmd, { stdout: 'pipe', stderr: 'pipe' });
  const output = Buffer.concat([result.stdout, result.stderr]).toString();

  if (result.exitCode !== 0) {
    console.log(`${step.name}: Fail`);
    console.log(output);
    process.exit(1);
  } else {
    console.log(`${step.name}: Pass`);
  }
}

process.exit(0);
