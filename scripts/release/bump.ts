#!/usr/bin/env bun

import { updateWorkspaceVersions } from './lib.js';

async function main(): Promise<void> {
  const version = process.env.RELEASE_VERSION;
  if (!version) {
    throw new Error('RELEASE_VERSION is required');
  }

  const root = process.cwd();
  const updated = await updateWorkspaceVersions(root, version);

  if (updated.length === 0) {
    throw new Error(`No package manifests updated for version ${version}`);
  }

  console.log(`Updated ${updated.length} manifests to ${version}`);
}

await main();
