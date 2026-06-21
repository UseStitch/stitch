import { createServer, type Server } from 'node:http';
import { URL } from 'node:url';
import * as oauth from 'openid-client';

import type { OAuthConfig } from '@stitch/shared/connectors/types';

import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'oauth2' });

type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
};

type OAuthErrorPayload = {
  error?: string;
  error_description?: string;
};

export class OAuthRefreshError extends Error {
  readonly status: number;
  readonly errorCode: string | undefined;
  readonly errorDescription: string | undefined;
  readonly clockSkewMs: number | undefined;

  constructor(status: number, bodyText: string, clockSkewMs?: number) {
    super(`Token refresh failed (${status}): ${bodyText}`);
    this.name = 'OAuthRefreshError';
    this.status = status;
    this.clockSkewMs = clockSkewMs;

    let parsed: OAuthErrorPayload | null = null;
    try {
      parsed = JSON.parse(bodyText) as OAuthErrorPayload;
    } catch {
      parsed = null;
    }

    this.errorCode = parsed?.error;
    this.errorDescription = parsed?.error_description;
  }
}

/** Clock skew beyond this magnitude can itself cause Google to reject a valid refresh token. */
const CLOCK_SKEW_THRESHOLD_MS = 5 * 60_000;

/**
 * Detects whether an OAuth refresh failure represents a permanently invalid
 * grant (revoked/expired refresh token) that requires the user to reauthorize.
 *
 * An `invalid_grant` accompanied by significant client/server clock skew is
 * treated as transient: large skew alone causes Google to reject otherwise
 * valid tokens, and flagging reauthorization in that case produces a needless
 * reconnect loop. Such failures should resolve once the clock is corrected.
 */
export function requiresOAuthReauth(error: unknown): boolean {
  if (
    !(error instanceof OAuthRefreshError) ||
    error.status !== 400 ||
    error.errorCode !== 'invalid_grant'
  ) {
    return false;
  }

  if (error.clockSkewMs !== undefined && Math.abs(error.clockSkewMs) >= CLOCK_SKEW_THRESHOLD_MS) {
    return false;
  }

  return true;
}

async function createLoopbackServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    server.listen(0, '127.0.0.1', () => {
      if (settled) return;
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        settled = true;
        resolve({ server, port: addr.port });
        return;
      }

      server.close(() => fail(new Error('Could not bind OAuth callback server')));
    });
    server.once('error', fail);
  });
}

function createOAuthConfiguration(
  config: Pick<OAuthConfig, 'authUrl' | 'tokenUrl' | 'revokeUrl'>,
  clientId: string,
  clientSecret: string,
): oauth.Configuration {
  const tokenUrl = new URL(config.tokenUrl);
  const configuration = new oauth.Configuration(
    {
      issuer: tokenUrl.origin,
      authorization_endpoint: config.authUrl,
      token_endpoint: config.tokenUrl,
      revocation_endpoint: config.revokeUrl,
    },
    clientId,
    { client_secret: clientSecret },
    oauth.ClientSecretPost(clientSecret),
  );

  if (tokenUrl.protocol === 'http:' && tokenUrl.hostname === '127.0.0.1') {
    oauth.allowInsecureRequests(configuration);
  }

  return configuration;
}

function toOAuthTokens(response: oauth.TokenEndpointResponse): OAuthTokens {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresIn: response.expires_in ?? null,
  };
}

async function fetchWithRefreshError(
  url: string,
  options: oauth.CustomFetchOptions,
): Promise<Response> {
  const response = await fetch(url, options);
  if (response.ok) return response;

  const errorBody = await response.clone().text();
  const clockSkewMs = computeClockSkewMs(response.headers.get('date'));
  log.error(
    { event: 'oauth.refresh.failed', status: response.status, errorBody, clockSkewMs },
    'Token refresh failed',
  );
  throw new OAuthRefreshError(response.status, errorBody, clockSkewMs);
}

function findOAuthRefreshError(error: unknown): OAuthRefreshError | null {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof OAuthRefreshError) return current;
    current = current.cause;
  }

  return null;
}

/**
 * Starts a local OAuth2 authorization flow using PKCE.
 *
 * 1. Spins up an ephemeral localhost HTTP server
 * 2. Returns the authorization URL for the caller to open in a browser
 * 3. Waits for the OAuth callback with the authorization code
 * 4. Exchanges the code for tokens
 * 5. Shuts down the server and returns the tokens
 */
export async function startOAuthFlow(
  config: OAuthConfig,
  clientId: string,
  clientSecret: string,
  scopes: string[],
): Promise<{ authUrl: string; waitForTokens: () => Promise<OAuthTokens> }> {
  const { server, port } = await createLoopbackServer();
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const state = oauth.randomState();
  const codeVerifier = oauth.randomPKCECodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const oauthConfig = createOAuthConfiguration(config, clientId, clientSecret);

  const authUrl = oauth.buildAuthorizationUrl(oauthConfig, {
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    ...config.additionalParams,
  });

  log.info({ event: 'oauth.flow.started', port, scopes }, 'OAuth flow started');

  const tokenPromise = new Promise<OAuthTokens>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      rejectOnce(new Error('OAuth flow timed out after 5 minutes'));
    }, 300_000);

    const closeServer = () => {
      clearTimeout(timeout);
      server.close();
    };

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      closeServer();
      reject(error);
    };

    const resolveOnce = (tokens: OAuthTokens) => {
      if (settled) return;
      settled = true;
      closeServer();
      resolve(tokens);
    };

    server.on('request', async (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        const errorDesc = url.searchParams.get('error_description') ?? error;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(buildHtmlResponse('Authorization Failed', `Error: ${errorDesc}`, false));
        rejectOnce(new Error(`OAuth error: ${errorDesc}`));
        return;
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(buildHtmlResponse('Authorization Failed', 'Invalid callback parameters', false));
        rejectOnce(new Error('Invalid OAuth callback: missing code or state mismatch'));
        return;
      }

      try {
        const tokens = toOAuthTokens(
          await oauth.authorizationCodeGrant(oauthConfig, url, {
            pkceCodeVerifier: codeVerifier,
            expectedState: state,
          }),
        );

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          buildHtmlResponse(
            'Authorization Successful',
            'You can close this window and return to Stitch.',
            true,
          ),
        );

        resolveOnce(tokens);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          buildHtmlResponse('Authorization Failed', `Token exchange failed: ${message}`, false),
        );
        rejectOnce(e);
      }
    });

    server.on('error', rejectOnce);
  });

  log.info({ event: 'oauth.server.listening', port }, 'OAuth callback server ready');

  return { authUrl: authUrl.toString(), waitForTokens: () => tokenPromise };
}

export async function refreshAccessToken(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<OAuthTokens> {
  const config = createOAuthConfiguration({ authUrl: tokenUrl, tokenUrl }, clientId, clientSecret);
  config[oauth.customFetch] = fetchWithRefreshError;

  try {
    return toOAuthTokens(await oauth.refreshTokenGrant(config, refreshToken));
  } catch (error) {
    const refreshError = findOAuthRefreshError(error);
    if (refreshError) throw refreshError;
    throw error;
  }
}

/**
 * Computes the difference between the local clock and the server's `Date`
 * header, in milliseconds. Positive values mean the local clock is ahead.
 * Returns undefined when the header is missing or unparseable.
 */
function computeClockSkewMs(dateHeader: string | null): number | undefined {
  if (!dateHeader) return undefined;
  const serverTime = Date.parse(dateHeader);
  if (Number.isNaN(serverTime)) return undefined;
  return Date.now() - serverTime;
}

function buildHtmlResponse(title: string, message: string, success: boolean): string {
  const color = success ? '#22c55e' : '#ef4444';
  return `<!DOCTYPE html>
<html>
<head><title>${title}</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa;">
  <div style="text-align: center; max-width: 400px; padding: 2rem;">
    <div style="font-size: 3rem; margin-bottom: 1rem;">${success ? '&#10003;' : '&#10007;'}</div>
    <h1 style="color: ${color}; margin-bottom: 0.5rem;">${title}</h1>
    <p style="color: #a1a1aa;">${message}</p>
  </div>
</body>
</html>`;
}
