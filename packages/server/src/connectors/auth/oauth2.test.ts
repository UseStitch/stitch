import { afterEach, describe, expect, test } from 'bun:test';

import {
  OAuthRefreshError,
  refreshAccessToken,
  requiresOAuthReauth,
  startOAuthFlow,
} from '@/connectors/auth/oauth2.js';

const TOKEN_URL = 'https://token.example.test/token';
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Mocks the global fetch used by openid-client so requests to the configured
 * token endpoint resolve to a canned response, while any other request (e.g.
 * startOAuthFlow's real loopback callback server) passes through unmocked.
 */
function mockTokenEndpoint(status: number, body: unknown, headers: Record<string, string> = {}): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(TOKEN_URL)) return originalFetch(input, init);

    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  }) as typeof fetch;
}

/**
 * Builds a syntactically valid JWT with the given issuer, mirroring how a
 * provider issues an id_token whose issuer differs from the token endpoint
 * origin (e.g. Google's issuer is https://accounts.google.com while its token
 * endpoint is oauth2.googleapis.com).
 */
function idToken(iss: string): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const payload = encode({
    iss,
    sub: 'user-123',
    aud: 'client-id',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  });
  return `${header}.${payload}.signature`;
}

function invalidGrant(clockSkewMs?: number): OAuthRefreshError {
  return new OAuthRefreshError(
    400,
    JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
    clockSkewMs,
  );
}

describe('requiresOAuthReauth', () => {
  test('flags invalid_grant without clock skew as requiring reauthorization', () => {
    expect(requiresOAuthReauth(invalidGrant())).toBe(true);
  });

  test('flags invalid_grant with small clock skew as requiring reauthorization', () => {
    expect(requiresOAuthReauth(invalidGrant(60_000))).toBe(true);
  });

  test('treats invalid_grant with large clock skew as transient', () => {
    expect(requiresOAuthReauth(invalidGrant(10 * 60_000))).toBe(false);
    expect(requiresOAuthReauth(invalidGrant(-10 * 60_000))).toBe(false);
  });

  test('does not flag non-invalid_grant errors', () => {
    expect(requiresOAuthReauth(new OAuthRefreshError(500, 'server error'))).toBe(false);
    expect(requiresOAuthReauth(new OAuthRefreshError(400, JSON.stringify({ error: 'invalid_client' })))).toBe(false);
  });

  test('does not flag arbitrary errors', () => {
    expect(requiresOAuthReauth(new Error('socket hang up'))).toBe(false);
  });
});

describe('startOAuthFlow', () => {
  test('preserves connector params and completes loopback token exchange', async () => {
    mockTokenEndpoint(200, {
      access_token: 'access',
      token_type: 'Bearer',
      refresh_token: 'refresh',
      expires_in: 3600,
      id_token: idToken('https://accounts.example.test'),
    });

    const { authUrl, waitForTokens } = await startOAuthFlow(
      {
        authUrl: 'https://accounts.example.test/oauth/authorize',
        tokenUrl: TOKEN_URL,
        defaultScopes: [],
        scopeDescriptions: {},
        additionalParams: { access_type: 'offline', prompt: 'consent' },
      },
      'client-id',
      'client-secret',
      ['scope:read', 'scope:write'],
      { additionalParams: { login_hint: 'user@example.test' } },
    );

    const url = new URL(authUrl);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('login_hint')).toBe('user@example.test');

    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    if (!redirectUri || !state) throw new Error('OAuth URL missing callback parameters');

    const tokensPromise = waitForTokens();
    // Providers such as Google append their issuer as the `iss` callback param;
    // it must match the configured issuer (derived from the authUrl origin).
    await originalFetch(
      `${redirectUri}?code=auth-code&state=${state}&iss=${encodeURIComponent('https://accounts.example.test')}`,
    );

    expect(tokensPromise).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600 });
  });

  test('accepts an explicit issuer that differs from the authorization endpoint', async () => {
    mockTokenEndpoint(200, { access_token: 'access', token_type: 'Bearer', expires_in: 3600 });

    const { authUrl, waitForTokens } = await startOAuthFlow(
      {
        authUrl: 'https://login.example.test/authorize',
        tokenUrl: TOKEN_URL,
        issuer: 'https://issuer.example.test',
        defaultScopes: [],
        scopeDescriptions: {},
      },
      'client-id',
      'client-secret',
      ['scope:read'],
    );

    const url = new URL(authUrl);
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    if (!redirectUri || !state) throw new Error('OAuth URL missing callback parameters');

    const tokensPromise = waitForTokens();
    await originalFetch(
      `${redirectUri}?code=auth-code&state=${state}&iss=${encodeURIComponent('https://issuer.example.test')}`,
    );

    expect(tokensPromise).resolves.toEqual({ accessToken: 'access', refreshToken: null, expiresIn: 3600 });
  });
});

describe('refreshAccessToken', () => {
  test('ignores an id_token whose issuer differs from the token endpoint', async () => {
    mockTokenEndpoint(200, {
      access_token: 'new-access',
      token_type: 'Bearer',
      refresh_token: 'new-refresh',
      expires_in: 1800,
      id_token: idToken('https://accounts.google.com'),
    });

    expect(refreshAccessToken(TOKEN_URL, 'client-id', 'client-secret', 'old-refresh')).resolves.toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 1800,
    });
  });

  test('preserves refresh error details and clock skew', async () => {
    const serverTime = new Date(Date.now() - 10 * 60_000).toUTCString();
    mockTokenEndpoint(400, { error: 'invalid_grant', error_description: 'revoked' }, { Date: serverTime });

    try {
      await refreshAccessToken(TOKEN_URL, 'client-id', 'client-secret', 'old-refresh');
      throw new Error('expected refresh to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(OAuthRefreshError);
      expect((error as OAuthRefreshError).status).toBe(400);
      expect((error as OAuthRefreshError).errorCode).toBe('invalid_grant');
      expect((error as OAuthRefreshError).clockSkewMs).toBeGreaterThanOrEqual(5 * 60_000);
    }
  });
});
