import { afterEach, describe, expect, mock, test } from 'bun:test';

import { GoogleApiError, GoogleClient } from './client.js';
import { resetGoogleRateLimitCoordinatorForTests } from './rate-limit.js';
import { classifyGoogleToolError } from './tool-error.js';
import { buildGoogleToolsets } from './toolsets.js';

const originalFetch = globalThis.fetch;

describe('GoogleClient', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetGoogleRateLimitCoordinatorForTests();
  });

  test('retries with Retry-After when Google returns rate-limit errors', async () => {
    const fetchMock = mock<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'Rate Limit Exceeded',
              status: 'RESOURCE_EXHAUSTED',
              errors: [{ reason: 'rateLimitExceeded' }],
            },
          }),
          {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new GoogleClient({ getAccessToken: async () => 'token', quotaAccountKey: 'retry-test-account' });

    const result = await client.request<{ ok: boolean }>('https://www.googleapis.com/drive/v3/files');

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('forces one token refresh retry after a 401 response', async () => {
    const fetchMock = mock<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } }), {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );

    const getAccessToken = mock<(options?: { forceRefresh?: boolean }) => Promise<string>>()
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new GoogleClient({ getAccessToken, quotaAccountKey: 'reauth-test-account' });

    const result = await client.request<{ ok: boolean }>('https://www.googleapis.com/drive/v3/files');

    expect(result.ok).toBe(true);
    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(getAccessToken).toHaveBeenNthCalledWith(1, { forceRefresh: false });
    expect(getAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://www.googleapis.com/drive/v3/files',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }) }),
    );
  });

  test('preserves Google error signals for tool error classification', async () => {
    const fetchMock = mock<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'Request had insufficient authentication scopes.',
            status: 'PERMISSION_DENIED',
            details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
          },
        }),
        { status: 403, statusText: 'Forbidden', headers: { 'Content-Type': 'application/json' } },
      ),
    );

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new GoogleClient({ getAccessToken: async () => 'token', quotaAccountKey: 'scope-test-account' });

    try {
      await client.request('https://www.googleapis.com/drive/v3/files');
      throw new Error('Expected request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleApiError);
      expect((error as GoogleApiError).reasons).toContain('ACCESS_TOKEN_SCOPE_INSUFFICIENT');
      expect(classifyGoogleToolError(error)).toEqual({
        error: 'insufficient_google_permissions',
        message:
          "You aren't allowed to perform this action because the connected Google account does not have enough permissions.",
        retryable: false,
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('returns insufficient scope as a tool result instead of throwing', async () => {
    const fetchMock = mock<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'Insufficient Permission',
            status: 'PERMISSION_DENIED',
            errors: [{ reason: 'insufficientPermissions' }],
          },
        }),
        {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer error="insufficient_scope"' },
        },
      ),
    );

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new GoogleClient({
      getAccessToken: async () => 'token',
      quotaAccountKey: 'tool-scope-test-account',
    });
    const driveToolset = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      capabilities: ['google.drive.read'],
    }).find((toolset) => toolset.id === 'google-drive');
    const tools = driveToolset?.activate(async () => ({ client, usedAccount: 'me@example.com' }));

    const result = await tools?.drive_info.execute?.({ fileId: 'file-1' }, { toolCallId: 'call-1', messages: [] });

    expect(result).toEqual({
      error: 'insufficient_google_permissions',
      message:
        "You aren't allowed to perform this action because the connected Google account does not have enough permissions.",
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
