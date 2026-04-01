#!/usr/bin/env bun

import { $ } from 'bun';

async function main(): Promise<void> {
  const previousTag = process.env.RELEASE_PREVIOUS_TAG;
  if (!previousTag) {
    throw new Error('RELEASE_PREVIOUS_TAG is required');
  }

  const tagExists = (await $`git tag --list ${previousTag}`.text()).trim().length > 0;
  const range = tagExists ? `${previousTag}..HEAD` : 'HEAD';
  const raw = (await $`git log --pretty=format:- %s (%h) ${range}`.text()).trim();

  const body = raw.length > 0 ? raw : '- Initial release';
  const outputPath = process.env.RELEASE_NOTES_PATH;

  if (outputPath) {
    await Bun.write(outputPath, `${body}\n`);
  }

  if (process.env.GITHUB_OUTPUT) {
    await Bun.write(process.env.GITHUB_OUTPUT, `notes_path=${outputPath ?? ''}\n`);
  }

  console.log(body);
}

await main();
