#!/usr/bin/env bun

import { computeNextVersion, isValidBump } from './lib.js';

async function main(): Promise<void> {
  const bumpInput = process.env.RELEASE_BUMP ?? 'patch';
  if (!isValidBump(bumpInput)) {
    throw new Error(`Invalid RELEASE_BUMP value: ${bumpInput}`);
  }

  const info = await computeNextVersion(bumpInput);

  const lines = [
    `previous_tag=${info.previousTag}`,
    `previous_version=${info.previousVersion}`,
    `version=${info.version}`,
    `tag=${info.tag}`,
  ];

  if (process.env.GITHUB_OUTPUT) {
    await Bun.write(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }

  console.log(`Next release: ${info.previousTag} -> ${info.tag}`);
}

await main();
