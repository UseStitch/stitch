#!/usr/bin/env bun

import { $ } from 'bun';

import { computeNextVersion, isValidBump, updateWorkspaceVersions } from './lib.js';

async function ensureTagDoesNotExist(tag: string): Promise<void> {
  const existing = (await $`git tag --list ${tag}`.text()).trim();
  if (existing.length > 0) {
    throw new Error(`Tag already exists: ${tag}`);
  }
}

async function main(): Promise<void> {
  const bumpInput = process.env.RELEASE_BUMP ?? 'patch';
  if (!isValidBump(bumpInput)) {
    throw new Error(`Invalid RELEASE_BUMP value: ${bumpInput}`);
  }

  const info = await computeNextVersion(bumpInput);
  await ensureTagDoesNotExist(info.tag);

  const updated = await updateWorkspaceVersions(process.cwd(), info.version);
  if (updated.length === 0) {
    throw new Error(`No package manifests updated for version ${info.version}`);
  }

  await $`git add ${updated}`;
  await $`git commit -m ${`release: v${info.version}`}`;
  await $`git tag ${info.tag}`;
  await $`git push origin HEAD --follow-tags`;

  const releaseSha = (await $`git rev-parse HEAD`.text()).trim();

  const lines = [
    `previous_tag=${info.previousTag}`,
    `version=${info.version}`,
    `tag=${info.tag}`,
    `release_sha=${releaseSha}`,
  ];

  if (process.env.GITHUB_OUTPUT) {
    await Bun.write(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }

  console.log(`Created ${info.tag} at ${releaseSha}`);
}

await main();
