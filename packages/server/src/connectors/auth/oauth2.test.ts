import { describe, expect, test } from 'bun:test';
import { createServer, type Server } from 'node:http';

import {
  OAuthRefreshError,
  refreshAccessToken,
  requiresOAuthReauth,
  startOAuthFlow,
} from '@/connectors/auth/oauth2.js';
import type { AddressInfo } from 'node:net';

async function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
    server.once('error', reject);
  });
}

async function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function invalidGrant(clockSkewMs?: number): OAuthRefreshError {
  return new OAuthRefreshError(
    400,
    JSON.stringify({
      error: 'invalid_grant',
      error_description: 'Token has been expired or revoked.',
    }),
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
    expect(
      requiresOAuthReauth(new OAuthRefreshError(400, JSON.stringify({ error: 'invalid_client' }))),
    ).toBe(false);
  });

  test('does not flag arbitrary errors', () => {
    expect(requiresOAuthReauth(new Error('socket hang up'))).toBe(false);
  });
});

describe('startOAuthFlow', () => {
  test('preserves connector params and completes loopback token exchange', async () => {
    const tokenServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: 'access',
          token_type: 'Bearer',
          refresh_token: 'refresh',
          expires_in: 3600,
        }),
      );
    });
    const tokenPort = await listen(tokenServer);

    const { authUrl, waitForTokens } = await startOAuthFlow(
      {
        authUrl: 'https://accounts.example.test/oauth/authorize',
        tokenUrl: `http://127.0.0.1:${tokenPort}/token`,
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
    await fetch(`${redirectUri}?code=auth-code&state=${state}`);

    expect(tokensPromise).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 3600,
    });
    await close(tokenServer);
  });
});

describe('refreshAccessToken', () => {
  test('maps rotated refresh tokens', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: 'new-access',
          token_type: 'Bearer',
          refresh_token: 'new-refresh',
          expires_in: 1800,
        }),
      );
    });
    const port = await listen(server);

    expect(
      refreshAccessToken(
        `http://127.0.0.1:${port}/token`,
        'client-id',
        'client-secret',
        'old-refresh',
      ),
    ).resolves.toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 1800,
    });

    await close(server);
  });

  test('preserves refresh error details and clock skew', async () => {
    const serverTime = new Date(Date.now() - 10 * 60_000).toUTCString();
    const server = createServer((_req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json', Date: serverTime });
      res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'revoked' }));
    });
    const port = await listen(server);

    try {
      await refreshAccessToken(
        `http://127.0.0.1:${port}/token`,
        'client-id',
        'client-secret',
        'old-refresh',
      );
      throw new Error('expected refresh to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(OAuthRefreshError);
      expect((error as OAuthRefreshError).status).toBe(400);
      expect((error as OAuthRefreshError).errorCode).toBe('invalid_grant');
      expect((error as OAuthRefreshError).clockSkewMs).toBeGreaterThanOrEqual(5 * 60_000);
    }

    await close(server);
  });
});
