import { afterEach, describe, expect, mock, test } from 'bun:test';

import { GoogleClient } from './client.js';
import { resetGoogleRateLimitCoordinatorForTests } from './rate-limit.js';

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
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new GoogleClient({
      getAccessToken: async () => 'token',
      quotaAccountKey: 'retry-test-account',
    });

    const result = await client.request<{ ok: boolean }>(
      'https://www.googleapis.com/drive/v3/files',
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('forces one token refresh retry after a 401 response', async () => {
    const fetchMock = mock<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'Invalid Credentials',
              status: 'UNAUTHENTICATED',
            },
          }),
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const getAccessToken = mock<(options?: { forceRefresh?: boolean }) => Promise<string>>()
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new GoogleClient({
      getAccessToken,
      quotaAccountKey: 'reauth-test-account',
    });

    const result = await client.request<{ ok: boolean }>(
      'https://www.googleapis.com/drive/v3/files',
    );

    expect(result.ok).toBe(true);
    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(getAccessToken).toHaveBeenNthCalledWith(1, { forceRefresh: false });
    expect(getAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://www.googleapis.com/drive/v3/files',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
      }),
    );
  });
});
