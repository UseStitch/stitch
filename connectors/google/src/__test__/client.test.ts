import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleClient } from '../client.js';
import { resetGoogleRateLimitCoordinatorForTests } from '../rate-limit.js';

describe('GoogleClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetGoogleRateLimitCoordinatorForTests();
  });

  it('retries with Retry-After when Google returns rate-limit errors', async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
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
            headers: { 'Content-Type': 'application/json', 'Retry-After': '1' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const client = new GoogleClient({
      getAccessToken: async () => 'token',
      quotaAccountKey: 'retry-test-account',
    });

    const pending = client.request<{ ok: boolean }>('https://www.googleapis.com/drive/v3/files');

    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
