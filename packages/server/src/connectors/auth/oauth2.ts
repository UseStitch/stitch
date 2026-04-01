import { createServer, type Server } from 'node:http';
import { URL, URLSearchParams } from 'node:url';
import crypto from 'node:crypto';

import type { OAuthConfig } from '@stitch/shared/connectors/types';

import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'oauth2' });

type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
};

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not find free port')));
      }
    });
    server.on('error', reject);
  });
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
  const port = await findFreePort();
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    ...config.additionalParams,
  });

  const authUrl = `${config.authUrl}?${authParams.toString()}`;

  log.info({ event: 'oauth.flow.started', port, scopes }, 'OAuth flow started');

  const waitForTokens = (): Promise<OAuthTokens> => {
    return new Promise((resolve, reject) => {
      let server: Server;
      const timeout = setTimeout(() => {
        server?.close();
        reject(new Error('OAuth flow timed out after 5 minutes'));
      }, 300_000);

      server = createServer(async (req, res) => {
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
          clearTimeout(timeout);
          server.close();
          reject(new Error(`OAuth error: ${errorDesc}`));
          return;
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(
            buildHtmlResponse('Authorization Failed', 'Invalid callback parameters', false),
          );
          clearTimeout(timeout);
          server.close();
          reject(new Error('Invalid OAuth callback: missing code or state mismatch'));
          return;
        }

        try {
          const tokens = await exchangeCodeForTokens(
            config.tokenUrl,
            code,
            clientId,
            clientSecret,
            redirectUri,
            codeVerifier,
          );

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            buildHtmlResponse(
              'Authorization Successful',
              'You can close this window and return to Stitch.',
              true,
            ),
          );

          clearTimeout(timeout);
          server.close();
          resolve(tokens);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            buildHtmlResponse('Authorization Failed', `Token exchange failed: ${message}`, false),
          );
          clearTimeout(timeout);
          server.close();
          reject(e);
        }
      });

      server.listen(port, '127.0.0.1', () => {
        log.info({ event: 'oauth.server.listening', port }, 'OAuth callback server ready');
      });

      server.on('error', (e) => {
        clearTimeout(timeout);
        reject(e);
      });
    });
  };

  return { authUrl, waitForTokens };
}

async function exchangeCodeForTokens(
  tokenUrl: string,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error({ event: 'oauth.token.exchange.failed', status: response.status, errorBody }, 'Token exchange failed');
    throw new Error(`Token exchange failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  log.info({ event: 'oauth.token.exchange.success' }, 'Token exchange successful');

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? null,
  };
}

export async function refreshAccessToken(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error({ event: 'oauth.refresh.failed', status: response.status, errorBody }, 'Token refresh failed');
    throw new Error(`Token refresh failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? null,
  };
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
