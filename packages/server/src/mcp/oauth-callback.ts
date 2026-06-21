import { createServer, type Server } from 'node:http';
import { URL } from 'node:url';

import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'mcp-oauth-callback' });

const DEFAULT_PORT = 19876;
const CALLBACK_PATH = '/mcp/oauth/callback';
const AUTH_TIMEOUT_MS = 5 * 60_000;

type PendingAuth = {
  serverId: string;
  resolve: (code: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

/** state -> pending auth. This map is the authoritative source for CSRF verification. */
const pending = new Map<string, PendingAuth>();

let server: Server | null = null;
let activePort: number | null = null;

function resolvePort(): number {
  const raw = process.env['STITCH_MCP_OAUTH_PORT']?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

export function getMcpOAuthRedirectUri(): string {
  const port = activePort ?? resolvePort();
  return `http://127.0.0.1:${port}${CALLBACK_PATH}`;
}

function handleRequest(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${activePort ?? resolvePort()}`);

  if (url.pathname !== CALLBACK_PATH) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  // CSRF: the presence of `state` in the in-memory map is authoritative.
  const entry = state ? pending.get(state) : undefined;
  if (!state || !entry) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(buildHtmlResponse('Authorization Failed', 'Unknown or missing state parameter.', false));
    return;
  }

  pending.delete(state);
  clearTimeout(entry.timeout);

  if (error) {
    const description = url.searchParams.get('error_description') ?? error;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(buildHtmlResponse('Authorization Failed', `Error: ${description}`, false));
    entry.reject(new Error(`OAuth error: ${description}`));
    return;
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(buildHtmlResponse('Authorization Failed', 'Missing authorization code.', false));
    entry.reject(new Error('Invalid OAuth callback: missing code'));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(
    buildHtmlResponse(
      'Authorization Successful',
      'You can close this window and return to Stitch.',
      true,
    ),
  );
  entry.resolve(code);
}

/** Lazily start the callback listener. No-op if already running. */
export function ensureRunning(): Promise<void> {
  if (server) return Promise.resolve();

  const port = resolvePort();
  return new Promise((resolve, reject) => {
    const listener = createServer(handleRequest);
    listener.on('error', (e) => {
      reject(e);
    });
    listener.listen(port, '127.0.0.1', () => {
      server = listener;
      activePort = port;
      log.info({ event: 'mcp.oauth.callback.listening', port }, 'MCP OAuth callback server ready');
      resolve();
    });
  });
}

/**
 * Register a pending auth keyed by `state` and return a promise that resolves
 * with the authorization code once the callback fires (or rejects on timeout).
 */
export function registerPendingAuth(input: { state: string; serverId: string }): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(input.state);
      reject(new Error('MCP OAuth flow timed out after 5 minutes'));
    }, AUTH_TIMEOUT_MS);
    timeout.unref?.();

    pending.set(input.state, { serverId: input.serverId, resolve, reject, timeout });
  });
}

/** Reject and remove the single pending auth for a server (clears its timer). */
export function cancelPending(serverId: string): void {
  for (const [state, entry] of pending.entries()) {
    if (entry.serverId !== serverId) continue;
    clearTimeout(entry.timeout);
    pending.delete(state);
    entry.reject(new Error('MCP OAuth flow cancelled'));
  }
}

/** Close the listener and reject/clear all pending auths. */
export function stop(): Promise<void> {
  for (const [state, entry] of pending.entries()) {
    clearTimeout(entry.timeout);
    entry.reject(new Error('MCP OAuth callback server stopped'));
    pending.delete(state);
  }

  const listener = server;
  server = null;
  activePort = null;
  if (!listener) return Promise.resolve();
  return new Promise((resolve) => listener.close(() => resolve()));
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
