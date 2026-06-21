#!/usr/bin/env bun

interface Asset {
  name: string;
  download_count: number;
}

interface Release {
  tag_name: string;
  assets: Asset[];
}

interface CloudflareGraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

interface RegistryStatsGroup {
  dimensions: {
    clientRequestPath: string;
    userAgent: string;
  };
  sum: {
    requests: number;
    bytes: number;
  };
}

interface RegistryStats {
  since: string;
  until: string;
  total: number;
  bytes: number;
  per_path: { path: string; requests: number; bytes: number }[];
  per_user_agent: { user_agent: string; requests: number; bytes: number }[];
}

const REGISTRY_PATHS = ['/mcp-registry.json', '/embedding-models.json', '/stt-models.json'];

async function fetchReleases(): Promise<Release[]> {
  const releases: Release[] = [];
  let page = 1;
  const per = 100;

  while (true) {
    const url = `https://api.github.com/repos/UseStitch/stitch/releases?page=${page}&per_page=${per}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const batch: Release[] = await response.json();
    if (batch.length === 0) break;

    releases.push(...batch);
    console.log(`Fetched page ${page} with ${batch.length} releases`);

    if (batch.length < per) break;
    page++;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return releases;
}

function sumDownloads(releases: Release[]): number {
  return releases.reduce((total, release) => {
    return total + release.assets.reduce((sum, asset) => sum + asset.download_count, 0);
  }, 0);
}

async function reportToPostHog(total: number, releases: Release[]) {
  const key = process.env['POSTHOG_KEY'];

  if (!key) {
    console.warn('POSTHOG_KEY not set, skipping PostHog report');
    return;
  }

  const perRelease = releases.map((release) => ({
    tag: release.tag_name,
    downloads: release.assets.reduce((sum, asset) => sum + asset.download_count, 0),
  }));

  const response = await fetch('https://us.i.posthog.com/i/v0/e/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      distinct_id: 'download',
      event: 'download',
      properties: {
        source: 'github',
        total,
        per_release: perRelease,
      },
    }),
  }).catch(() => null);

  if (response && !response.ok) {
    console.warn(`PostHog API error: ${response.status}`);
  }
}

function aggregateRegistryStats(
  groups: RegistryStatsGroup[],
  since: string,
  until: string,
): RegistryStats {
  const perPath = new Map<string, { requests: number; bytes: number }>();
  const perUserAgent = new Map<string, { requests: number; bytes: number }>();

  for (const group of groups) {
    const requests = group.sum.requests;
    const bytes = group.sum.bytes;
    const path = group.dimensions.clientRequestPath || 'unknown';
    const userAgent = group.dimensions.userAgent || 'unknown';

    const pathStats = perPath.get(path) ?? { requests: 0, bytes: 0 };
    pathStats.requests += requests;
    pathStats.bytes += bytes;
    perPath.set(path, pathStats);

    const userAgentStats = perUserAgent.get(userAgent) ?? { requests: 0, bytes: 0 };
    userAgentStats.requests += requests;
    userAgentStats.bytes += bytes;
    perUserAgent.set(userAgent, userAgentStats);
  }

  return {
    since,
    until,
    total: groups.reduce((sum, group) => sum + group.sum.requests, 0),
    bytes: groups.reduce((sum, group) => sum + group.sum.bytes, 0),
    per_path: [...perPath.entries()].map(([path, stats]) => ({ path, ...stats })),
    per_user_agent: [...perUserAgent.entries()]
      .map(([user_agent, stats]) => ({ user_agent, ...stats }))
      .toSorted((a, b) => b.requests - a.requests),
  };
}

async function fetchCloudflareRegistryStats(): Promise<RegistryStats | null> {
  const token = process.env['CLOUDFLARE_API_TOKEN'];
  const zoneTag = process.env['CLOUDFLARE_ZONE_ID'];
  const host = process.env['CLOUDFLARE_REGISTRY_HOST'] || 'usestitch.ai';

  if (!token || !zoneTag) {
    console.warn('CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not set, skipping registry stats');
    return null;
  }

  const until = new Date();
  const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);
  const query = `
    query RegistryStats($zoneTag: string!, $host: string!, $paths: [string!], $since: Time!, $until: Time!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequestsAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $since
              datetime_lt: $until
              clientRequestHTTPHost: $host
              clientRequestPath_in: $paths
            }
          ) {
            dimensions {
              clientRequestPath
              userAgent
            }
            sum {
              requests
              bytes
            }
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        zoneTag,
        host,
        paths: REGISTRY_PATHS,
        since: since.toISOString(),
        until: until.toISOString(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
  }

  const payload: CloudflareGraphQLResponse<{
    viewer: { zones: { httpRequestsAdaptiveGroups: RegistryStatsGroup[] }[] };
  }> = await response.json();

  if (payload.errors?.length) {
    throw new Error(
      `Cloudflare GraphQL error: ${payload.errors.map((error) => error.message).join(', ')}`,
    );
  }

  const groups = payload.data?.viewer.zones[0]?.httpRequestsAdaptiveGroups ?? [];
  return aggregateRegistryStats(groups, since.toISOString(), until.toISOString());
}

async function reportRegistryStatsToPostHog(stats: RegistryStats | null) {
  if (!stats) return;

  const key = process.env['POSTHOG_KEY'];
  if (!key) return;

  const response = await fetch('https://us.i.posthog.com/i/v0/e/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      distinct_id: 'registry',
      event: 'registry_fetch',
      properties: {
        source: 'cloudflare',
        ...stats,
      },
    }),
  }).catch(() => null);

  if (response && !response.ok) {
    console.warn(`PostHog registry stats API error: ${response.status}`);
  }
}

console.log('Fetching GitHub releases for UseStitch/stitch...\n');

const releases = await fetchReleases();
console.log(`\nFetched ${releases.length} releases total\n`);

const total = sumDownloads(releases);
console.log(`Total GitHub downloads: ${total.toLocaleString()}`);

await reportToPostHog(total, releases);

const registryStats = await fetchCloudflareRegistryStats();
if (registryStats) {
  console.log(`Registry requests in last 24h: ${registryStats.total.toLocaleString()}`);
  await reportRegistryStatsToPostHog(registryStats);
}

console.log('='.repeat(60));
console.log(`TOTAL DOWNLOADS: ${total.toLocaleString()}`);
if (registryStats) console.log(`TOTAL REGISTRY REQUESTS: ${registryStats.total.toLocaleString()}`);
console.log('='.repeat(60));
