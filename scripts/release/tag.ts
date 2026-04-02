#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { $ } from 'bun';

import { getLatestTag, resolveTagSha, tagExistsLocally, tagExistsRemotely } from './lib.js';

interface PackageJsonShape {
  version?: string;
}

async function resolveVersion(): Promise<string> {
  if (process.env.RELEASE_VERSION) {
    return process.env.RELEASE_VERSION;
  }

  const desktopPackage = join(process.cwd(), 'apps', 'desktop', 'package.json');
  const raw = await readFile(desktopPackage, 'utf8');
  const parsed = JSON.parse(raw) as PackageJsonShape;

  if (!parsed.version) {
    throw new Error('Unable to resolve version from apps/desktop/package.json');
  }

  return parsed.version;
}

async function main(): Promise<void> {
  const version = await resolveVersion();
  const tag = `v${version}`;
  const releaseSha = (await $`git rev-parse HEAD`.text()).trim();
  const previousTag = (await getLatestTag()) ?? 'v0.0.0';

  const localTag = await tagExistsLocally(tag);
  const remoteTag = await tagExistsRemotely(tag);

  if (localTag || remoteTag) {
    const tagSha = await resolveTagSha(tag);
    if (tagSha && tagSha !== releaseSha) {
      throw new Error(`Tag ${tag} exists on a different commit (${tagSha})`);
    }
  } else {
    await $`git tag ${tag}`;
    await $`git push origin ${tag}`;
  }

  const lines = [`previous_tag=${previousTag}`, `version=${version}`, `tag=${tag}`, `release_sha=${releaseSha}`];

  if (process.env.GITHUB_OUTPUT) {
    await Bun.write(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }

  console.log(`Using release tag ${tag} at ${releaseSha}`);
}

await main();
