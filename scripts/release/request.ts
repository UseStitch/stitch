#!/usr/bin/env bun

import { $ } from 'bun';

import {
  computeNextVersion,
  isValidBump,
  tagExistsLocally,
  tagExistsRemotely,
  updateWorkspaceVersions,
} from './lib.js';

interface PullRequestRef {
  url: string;
}

async function resolveExistingPr(baseBranch: string, headBranch: string): Promise<string | null> {
  const refs =
    (await $`gh pr list --base ${baseBranch} --head ${headBranch} --state open --json url`.json()) as PullRequestRef[];

  return refs.length > 0 ? refs[0].url : null;
}

async function main(): Promise<void> {
  const bumpInput = process.env.RELEASE_BUMP ?? 'patch';
  if (!isValidBump(bumpInput)) {
    throw new Error(`Invalid RELEASE_BUMP value: ${bumpInput}`);
  }

  const baseBranch = process.env.RELEASE_BASE_BRANCH ?? 'production';
  const branchPrefix = process.env.RELEASE_BRANCH_PREFIX ?? 'release';

  const info = await computeNextVersion(bumpInput);
  const releaseBranch = `${branchPrefix}/${info.tag}`;

  if ((await tagExistsLocally(info.tag)) || (await tagExistsRemotely(info.tag))) {
    throw new Error(`Release tag already exists: ${info.tag}`);
  }

  await $`git fetch origin ${baseBranch} --tags`;
  await $`git checkout -B ${releaseBranch} origin/${baseBranch}`;

  const updated = await updateWorkspaceVersions(process.cwd(), info.version);
  if (updated.length === 0) {
    throw new Error(`No package manifests updated for version ${info.version}`);
  }

  await $`git add ${updated}`;
  await $`git commit -m ${`release: v${info.version}`}`;
  await $`git push --set-upstream origin ${releaseBranch} --force-with-lease`;

  const releaseSha = (await $`git rev-parse HEAD`.text()).trim();

  const prBody = `## Summary\n- prepare ${info.tag} from ${baseBranch}\n- update workspace package versions to ${info.version}\n- release artifacts and GitHub release are published after this PR merges`;

  const existingPr = await resolveExistingPr(baseBranch, releaseBranch);
  const prUrl =
    existingPr ??
    (await $`gh pr create --base ${baseBranch} --head ${releaseBranch} --title ${`release: ${info.tag}`} --body ${prBody}`
      .text())
      .trim();

  const lines = [
    `previous_tag=${info.previousTag}`,
    `version=${info.version}`,
    `tag=${info.tag}`,
    `branch=${releaseBranch}`,
    `release_sha=${releaseSha}`,
    `pr_url=${prUrl}`,
  ];

  if (process.env.GITHUB_OUTPUT) {
    await Bun.write(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }

  console.log(`Release PR ready: ${prUrl}`);
}

await main();
