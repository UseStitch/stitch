import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { $ } from 'bun';

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export type BumpKind = 'major' | 'minor' | 'patch';

export interface ReleaseVersionInfo {
  previousTag: string;
  previousVersion: string;
  version: string;
  tag: string;
}

export interface ReleaseRequestInfo extends ReleaseVersionInfo {
  branch: string;
  releaseSha: string;
  prUrl: string;
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(value: string): Semver {
  const match = value.match(SEMVER_RE);
  if (!match) {
    throw new Error(`Invalid semver value: ${value}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatSemver(value: Semver): string {
  return `${value.major}.${value.minor}.${value.patch}`;
}

function bumpSemver(version: string, bump: BumpKind): string {
  const parsed = parseSemver(version);

  if (bump === 'major') {
    return formatSemver({ major: parsed.major + 1, minor: 0, patch: 0 });
  }

  if (bump === 'minor') {
    return formatSemver({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
  }

  return formatSemver({ major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1 });
}

export async function getLatestTag(): Promise<string | null> {
  const output = (await $`git tag --list "v*" --sort=-v:refname`.text()).trim();
  if (!output) {
    return null;
  }

  const tags = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const tag of tags) {
    if (SEMVER_RE.test(tag.replace(/^v/, ''))) {
      return tag;
    }
  }

  return null;
}

export async function tagExistsRemotely(tag: string): Promise<boolean> {
  const output = (await $`git ls-remote --tags origin refs/tags/${tag}`.text()).trim();
  return output.length > 0;
}

export async function tagExistsLocally(tag: string): Promise<boolean> {
  const output = (await $`git tag --list ${tag}`.text()).trim();
  return output.length > 0;
}

export async function resolveTagSha(tag: string): Promise<string | null> {
  const result = await $`git rev-list -n 1 ${tag}`.nothrow();
  if (result.exitCode !== 0) {
    return null;
  }

  const sha = result.text().trim();
  return sha.length > 0 ? sha : null;
}

export async function computeNextVersion(bump: BumpKind): Promise<ReleaseVersionInfo> {
  const previousTag = (await getLatestTag()) ?? 'v0.0.0';
  const previousVersion = previousTag.replace(/^v/, '');
  const version = bumpSemver(previousVersion, bump);

  return {
    previousTag,
    previousVersion,
    version,
    tag: `v${version}`,
  };
}

async function listManifestFiles(root: string): Promise<string[]> {
  const dirs = [join(root, 'apps'), join(root, 'packages')];
  const manifests: string[] = [];

  for (const dir of dirs) {
    let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      manifests.push(join(dir, entry.name, 'package.json'));
    }
  }

  return manifests;
}

export async function updateWorkspaceVersions(root: string, version: string): Promise<string[]> {
  const manifests = await listManifestFiles(root);
  const updated: string[] = [];

  for (const file of manifests) {
    let raw = '';
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    const parsed = JSON.parse(raw) as { version?: string };
    if (!parsed.version || parsed.version === version) {
      continue;
    }

    parsed.version = version;
    await writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`);
    updated.push(file);
  }

  return updated;
}

export function isValidBump(value: string): value is BumpKind {
  return value === 'major' || value === 'minor' || value === 'patch';
}

export function isReleaseCommitMessage(value: string): boolean {
  return /^release: v\d+\.\d+\.\d+$/.test(value.trim());
}
