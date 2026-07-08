import { afterEach, describe, expect, test } from 'bun:test';

import {
  DEFAULT_GOOGLE_RATE_LIMIT_CONFIG,
  GoogleRateLimitCoordinator,
  resetGoogleRateLimitCoordinatorForTests,
  resolveGoogleQuotaOperation,
} from './rate-limit.js';

afterEach(() => {
  resetGoogleRateLimitCoordinatorForTests();
});

describe('resolveGoogleQuotaOperation', () => {
  test('maps Gmail endpoints to method-specific quota units', () => {
    expect(resolveGoogleQuotaOperation('https://gmail.googleapis.com/gmail/v1/users/me/messages', 'GET')).toEqual({
      service: 'gmail',
      quotaCost: 5,
    });

    expect(
      resolveGoogleQuotaOperation('https://gmail.googleapis.com/gmail/v1/users/me/messages/abc?format=FULL', 'GET'),
    ).toEqual({ service: 'gmail', quotaCost: 5 });

    expect(
      resolveGoogleQuotaOperation(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/abc/attachments/att-1',
        'GET',
      ),
    ).toEqual({ service: 'gmail', quotaCost: 20 });

    expect(resolveGoogleQuotaOperation('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 'POST')).toEqual(
      { service: 'gmail', quotaCost: 100 },
    );

    expect(
      resolveGoogleQuotaOperation('https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-1/modify', 'POST'),
    ).toEqual({ service: 'gmail', quotaCost: 10 });

    expect(resolveGoogleQuotaOperation('https://gmail.googleapis.com/batch/gmail/v1', 'POST')).toEqual({
      service: 'gmail',
      quotaCost: 5,
    });
  });

  test('maps Gmail settings.filters endpoints to correct quota costs', () => {
    expect(
      resolveGoogleQuotaOperation('https://gmail.googleapis.com/gmail/v1/users/me/settings/filters', 'GET'),
    ).toEqual({ service: 'gmail', quotaCost: 1 });

    expect(
      resolveGoogleQuotaOperation('https://gmail.googleapis.com/gmail/v1/users/me/settings/filters', 'POST'),
    ).toEqual({ service: 'gmail', quotaCost: 5 });

    expect(
      resolveGoogleQuotaOperation(
        'https://gmail.googleapis.com/gmail/v1/users/me/settings/filters/filter-id-123',
        'GET',
      ),
    ).toEqual({ service: 'gmail', quotaCost: 1 });

    expect(
      resolveGoogleQuotaOperation(
        'https://gmail.googleapis.com/gmail/v1/users/me/settings/filters/filter-id-123',
        'DELETE',
      ),
    ).toEqual({ service: 'gmail', quotaCost: 5 });
  });

  test('maps Drive endpoints to method-specific quota units', () => {
    expect(resolveGoogleQuotaOperation('https://www.googleapis.com/drive/v3/files?q=test', 'GET')).toEqual({
      service: 'drive',
      quotaCost: 100,
    });

    expect(resolveGoogleQuotaOperation('https://www.googleapis.com/drive/v3/files/file-1', 'GET')).toEqual({
      service: 'drive',
      quotaCost: 5,
    });

    expect(resolveGoogleQuotaOperation('https://www.googleapis.com/drive/v3/files/file-1?alt=media', 'GET')).toEqual({
      service: 'drive',
      quotaCost: 200,
    });

    expect(
      resolveGoogleQuotaOperation('https://www.googleapis.com/drive/v3/files/file-1/export?mimeType=text/plain', 'GET'),
    ).toEqual({ service: 'drive', quotaCost: 200 });

    expect(resolveGoogleQuotaOperation('https://www.googleapis.com/drive/v3/files/file-1', 'PATCH')).toEqual({
      service: 'drive',
      quotaCost: 50,
    });

    expect(
      resolveGoogleQuotaOperation('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', 'POST'),
    ).toEqual({ service: 'drive', quotaCost: 5 });
  });

  test('maps non-Gmail and non-Drive services to request-count quota units', () => {
    expect(resolveGoogleQuotaOperation('https://docs.googleapis.com/v1/documents/abc', 'GET')).toEqual({
      service: 'docsRead',
      quotaCost: 1,
    });

    expect(resolveGoogleQuotaOperation('https://docs.googleapis.com/v1/documents/abc:batchUpdate', 'POST')).toEqual({
      service: 'docsWrite',
      quotaCost: 1,
    });

    expect(
      resolveGoogleQuotaOperation('https://www.googleapis.com/calendar/v3/calendars/primary/events', 'GET'),
    ).toEqual({ service: 'calendar', quotaCost: 1 });
  });
});

describe('GoogleRateLimitCoordinator', () => {
  test('queues requests when account quota is saturated', async () => {
    resetGoogleRateLimitCoordinatorForTests();

    const coordinator = new GoogleRateLimitCoordinator(
      {
        ...DEFAULT_GOOGLE_RATE_LIMIT_CONFIG,
        maxQueueWaitMs: 100,
        services: {
          ...DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services,
          drive: { project: { capacity: 200, windowMs: 5 }, account: { capacity: 100, windowMs: 5 } },
        },
      },
      'account-a',
    );

    await coordinator.acquire('https://www.googleapis.com/drive/v3/files', 'GET');

    let settled = false;
    const queued = coordinator.acquire('https://www.googleapis.com/drive/v3/files', 'GET').then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    await queued;
    expect(settled).toBe(true);
  });
});
