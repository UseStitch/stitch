#!/usr/bin/env bun
import { spawnSync } from 'bun';

const steps = [
  { name: 'test', cmd: ['bun', 'run', '--filter', '*', 'test'] },
  { name: 'typecheck', cmd: ['bun', 'run', 'typecheck'] },
  { name: 'lint', cmd: ['bunx', 'oxlint', '--config', 'oxlint.json', '.'] },
  // { name: "knip", cmd: ["bunx", "knip"] },
  { name: 'check:catalogs', cmd: ['bun', 'run', 'scripts/check-catalogs.ts'] },
];

let failed = false;

for (const step of steps) {
  console.log(`\n--- ${step.name} ---`);
  const result = spawnSync(step.cmd, { stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) {
    console.error(`\n${step.name} failed with exit code ${result.exitCode}`);
    failed = true;
    break;
  }
}

process.exit(failed ? 1 : 0);
