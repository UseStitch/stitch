import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  cancelPending,
  ensureRunning,
  getMcpOAuthRedirectUri,
  registerPendingAuth,
  stop,
} from '@/mcp/oauth-callback.js';

const TEST_PORT = '19911';

beforeAll(async () => {
  process.env['STITCH_MCP_OAUTH_PORT'] = TEST_PORT;
  await ensureRunning();
});

afterAll(async () => {
  await stop();
  delete process.env['STITCH_MCP_OAUTH_PORT'];
});

function callbackUrl(params: Record<string, string>): string {
  const url = new URL(`http://127.0.0.1:${TEST_PORT}/mcp/oauth/callback`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

describe('mcp oauth callback server', () => {
  test('resolves with the code when state matches a pending auth', async () => {
    const codePromise = registerPendingAuth({ state: 'state-1', serverId: 'mcp_a' });
    await fetch(callbackUrl({ state: 'state-1', code: 'auth-code' }));
    expect(await codePromise).toBe('auth-code');
  });

  test('rejects callbacks with an unknown state (CSRF)', async () => {
    const res = await fetch(callbackUrl({ state: 'unknown', code: 'x' }));
    expect(res.status).toBe(400);
  });

  test('rejects the pending auth when the provider returns an error', async () => {
    const codePromise = registerPendingAuth({ state: 'state-err', serverId: 'mcp_b' });
    let rejection: unknown;
    codePromise.catch((e) => {
      rejection = e;
    });
    await fetch(callbackUrl({ state: 'state-err', error: 'access_denied' }));
    await Promise.resolve();
    expect(String(rejection)).toMatch(/access_denied/);
  });

  test('cancelPending rejects only the matching server', async () => {
    let aRejection: unknown;
    const a = registerPendingAuth({ state: 'state-a', serverId: 'mcp_a' });
    a.catch((e) => {
      aRejection = e;
    });
    const b = registerPendingAuth({ state: 'state-b', serverId: 'mcp_b' });
    b.catch(() => undefined);

    cancelPending('mcp_a');
    await Promise.resolve();
    expect(String(aRejection)).toMatch(/cancelled/);

    await fetch(callbackUrl({ state: 'state-b', code: 'code-b' }));
    expect(await b).toBe('code-b');
  });

  test('getMcpOAuthRedirectUri reflects the active port', () => {
    expect(getMcpOAuthRedirectUri()).toBe(`http://127.0.0.1:${TEST_PORT}/mcp/oauth/callback`);
  });

  test('stop rejects all pending auths', async () => {
    let rejection: unknown;
    const pending = registerPendingAuth({ state: 'state-stop', serverId: 'mcp_c' });
    pending.catch((e) => {
      rejection = e;
    });
    await stop();
    await Promise.resolve();
    expect(rejection).toBeDefined();
  });
});
