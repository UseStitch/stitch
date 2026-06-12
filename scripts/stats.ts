#!/usr/bin/env bun

interface Asset {
  name: string
  download_count: number
}

interface Release {
  tag_name: string
  assets: Asset[]
}

async function fetchReleases(): Promise<Release[]> {
  const releases: Release[] = []
  let page = 1
  const per = 100

  while (true) {
    const url = `https://api.github.com/repos/UseStitch/stitch/releases?page=${page}&per_page=${per}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const batch: Release[] = await response.json()
    if (batch.length === 0) break

    releases.push(...batch)
    console.log(`Fetched page ${page} with ${batch.length} releases`)

    if (batch.length < per) break
    page++
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return releases
}

function sumDownloads(releases: Release[]): number {
  return releases.reduce((total, release) => {
    return total + release.assets.reduce((sum, asset) => sum + asset.download_count, 0)
  }, 0)
}

async function reportToPostHog(total: number, releases: Release[]) {
  const key = process.env['POSTHOG_KEY']

  if (!key) {
    console.warn('POSTHOG_KEY not set, skipping PostHog report')
    return
  }

  const perRelease = releases.map((release) => ({
    tag: release.tag_name,
    downloads: release.assets.reduce((sum, asset) => sum + asset.download_count, 0),
  }))

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
  }).catch(() => null)

  if (response && !response.ok) {
    console.warn(`PostHog API error: ${response.status}`)
  }
}

console.log('Fetching GitHub releases for UseStitch/stitch...\n')

const releases = await fetchReleases()
console.log(`\nFetched ${releases.length} releases total\n`)

const total = sumDownloads(releases)
console.log(`Total GitHub downloads: ${total.toLocaleString()}`)

await reportToPostHog(total, releases)

console.log('='.repeat(60))
console.log(`TOTAL DOWNLOADS: ${total.toLocaleString()}`)
console.log('='.repeat(60))
