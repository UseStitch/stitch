import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_GOOGLE_RATE_LIMIT_CONFIG,
  GoogleRateLimitCoordinator,
  resetGoogleRateLimitCoordinatorForTests,
  resolveGoogleQuotaOperation,
} from '../rate-limit.js';

describe('resolveGoogleQuotaOperation', () => {
  it('maps Gmail endpoints to method-specific quota units', () => {
    expect(
      resolveGoogleQuotaOperation('https://gmail.googleapis.com/gmail/v1/users/me/messages', 'GET'),
    ).toEqual({ service: 'gmail', quotaCost: 5 });

    expect(
      resolveGoogleQuotaOperation(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/abc?format=FULL',
        'GET',
      ),
    ).toEqual({ service: 'gmail', quotaCost: 5 });

    expect(
      resolveGoogleQuotaOperation('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 'POST'),
    ).toEqual({ service: 'gmail', quotaCost: 100 });

    expect(
      resolveGoogleQuotaOperation(
        'https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-1/modify',
        'POST',
      ),
    ).toEqual({ service: 'gmail', quotaCost: 10 });
  });

  it('maps non-Gmail services to request-count quota units', () => {
    expect(
      resolveGoogleQuotaOperation('https://www.googleapis.com/drive/v3/files?q=test', 'GET'),
    ).toEqual({ service: 'drive', quotaCost: 1 });

    expect(resolveGoogleQuotaOperation('https://docs.googleapis.com/v1/documents/abc', 'GET')).toEqual(
      { service: 'docsRead', quotaCost: 1 },
    );

    expect(
      resolveGoogleQuotaOperation('https://docs.googleapis.com/v1/documents/abc:batchUpdate', 'POST'),
    ).toEqual({ service: 'docsWrite', quotaCost: 1 });

    expect(
      resolveGoogleQuotaOperation('https://www.googleapis.com/calendar/v3/calendars/primary/events', 'GET'),
    ).toEqual({ service: 'calendar', quotaCost: 1 });
  });
});

describe('GoogleRateLimitCoordinator', () => {
  it('queues requests when account quota is saturated', async () => {
    vi.useFakeTimers();
    resetGoogleRateLimitCoordinatorForTests();

    const coordinator = new GoogleRateLimitCoordinator(
      {
        ...DEFAULT_GOOGLE_RATE_LIMIT_CONFIG,
        maxQueueWaitMs: 2000,
        services: {
          ...DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services,
          drive: {
            project: { capacity: 100, windowMs: 1000 },
            account: { capacity: 1, windowMs: 1000 },
          },
        },
      },
      'account-a',
    );

    await coordinator.acquire('https://www.googleapis.com/drive/v3/files', 'GET');

    let settled = false;
    const queued = coordinator
      .acquire('https://www.googleapis.com/drive/v3/files', 'GET')
      .then(() => {
        settled = true;
      });

    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await queued;
    expect(settled).toBe(true);

    vi.useRealTimers();
  });
});
