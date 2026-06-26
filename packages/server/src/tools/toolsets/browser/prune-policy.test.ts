import { describe, expect, test } from 'bun:test';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { browserPrunePolicy } from '@/tools/toolsets/browser/prune-policy.js';

function toolResult(toolName: string): StoredPart {
  return {
    type: 'tool-result',
    id: `prt_${toolName}`,
    toolCallId: `call_${toolName}`,
    toolName,
    input: {},
    output: 'output',
    truncated: false,
    startedAt: 1,
    endedAt: 1,
  } as StoredPart;
}

describe('browserPrunePolicy', () => {
  test('marks previous snapshots stale when a newer snapshot appears', () => {
    const overrides = browserPrunePolicy.findProtectOverrides([
      {
        id: 'msg_browser' as never,
        parts: [toolResult('browser_snapshot'), toolResult('browser_snapshot')],
      },
    ]);

    expect(overrides.get('msg_browser:0')).toMatchObject({
      protectTokens: 10_000,
      reason: 'stale-browser-snapshot',
    });
    expect(overrides.has('msg_browser:1')).toBe(false);
  });

  test('marks active snapshots stale after navigation', () => {
    const overrides = browserPrunePolicy.findProtectOverrides([
      {
        id: 'msg_browser' as never,
        parts: [
          toolResult('browser_snapshot'),
          toolResult('browser_navigate'),
          toolResult('browser_snapshot'),
        ],
      },
    ]);

    expect(overrides.get('msg_browser:0')).toMatchObject({
      protectTokens: 10_000,
      reason: 'stale-browser-snapshot-after-navigation',
    });
    expect(overrides.has('msg_browser:2')).toBe(false);
  });
});
