#!/usr/bin/env bun
import { spawnSync } from "bun";

const steps = [
  { name: "typecheck", cmd: ["bun", "run", "typecheck"] },
  { name: "lint", cmd: ["bunx", "oxlint", "--config", "oxlint.json", "."] },
  { name: "knip", cmd: ["bunx", "knip"] },
];

let failed = false;

for (const step of steps) {
  console.log(`\n--- ${step.name} ---`);
  const result = spawnSync(step.cmd, { stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) {
    console.error(`\n${step.name} failed with exit code ${result.exitCode}`);
    failed = true;
    break;
  }
}

process.exit(failed ? 1 : 0);
