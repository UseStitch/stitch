#!/usr/bin/env bun
import { spawnSync } from 'bun';

const steps = [
  { name: 'test', cmd: ['bun', 'run', '--filter', '*', 'test'] },
  { name: 'typecheck', cmd: ['bun', 'run', 'typecheck'] },
  {
    name: 'lint',
    cmd: ['bunx', 'oxlint', '--config', 'oxlint.json', '--fix', '--fix-suggestions', '.'],
  },
  {
    name: 'lint:check',
    cmd: ['bunx', 'oxlint', '--config', 'oxlint.json', '--deny-warnings', '.'],
  },
  { name: 'knip', cmd: ['bunx', 'knip', '--fix', '--allow-remove-files'] },
  { name: 'knip:check', cmd: ['bunx', 'knip'] },
  { name: 'catalogs', cmd: ['bun', 'run', 'scripts/check-catalogs.ts'] },
];

let failed = false;

for (const step of steps) {
  const result = spawnSync(step.cmd, { stdout: 'pipe', stderr: 'pipe' });
  const output = Buffer.concat([result.stdout, result.stderr]).toString();

  if (result.exitCode !== 0) {
    console.log(`${step.name}: Fail`);
    console.log(output);
    failed = true;
  } else {
    console.log(`${step.name}: Pass`);
  }
}

process.exit(failed ? 1 : 0);
