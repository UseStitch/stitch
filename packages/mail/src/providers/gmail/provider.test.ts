import { describe, expect, test } from 'bun:test';

import { createId } from '@stitch/shared/id';

import { createMailAccountId, type MailAccountRecord } from '../../db/schema.js';
import { buildRfc2822Message, gmailOpsProvider, gmailProviderModule, gmailSyncProvider } from './provider.js';

import type { MailProviderContext, OutgoingDraft } from '../../contracts.js';

function createAccount(): MailAccountRecord {
  return {
    id: createMailAccountId(),
    connectorInstanceId: createId('conn'),
    provider: 'gmail',
    email: 'test@example.com',
    enabled: true,
    syncPhase: 'idle',
    syncCursor: null,
    backfillCursor: null,
    lastSyncedAt: null,
    lastError: null,
    syncFrequencySeconds: 90,
    backfillDays: 30,
    createdAt: 0,
    updatedAt: 0,
  };
}

function createContext(response: Response): MailProviderContext {
  return {
    account: createAccount(),
    http: { request: async () => response },
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    signal: new AbortController().signal,
  };
}

describe('gmail provider', () => {
  test('exposes provider module ids', () => {
    expect(gmailSyncProvider.id).toBe('gmail');
    expect(gmailOpsProvider.id).toBe('gmail');
    expect(gmailProviderModule.sync).toBe(gmailSyncProvider);
    expect(gmailProviderModule.ops).toBe(gmailOpsProvider);
  });

  test('snapshotCursor returns profile history id', async () => {
    const ctx = createContext(Response.json({ historyId: '123' }));

    expect(gmailSyncProvider.snapshotCursor(ctx)).resolves.toBe('123');
  });

  test('builds multipart alternative RFC 2822 drafts', () => {
    const draft: OutgoingDraft = {
      to: [{ name: 'Ada Lovelace', email: 'ada@example.com' }],
      cc: [],
      bcc: [],
      subject: 'Hello',
      bodyText: 'Plain',
      bodyHtml: '<p>Plain</p>',
      inReplyTo: { providerMessageId: 'msg-1', providerThreadId: 'thr-1' },
    };

    const message = buildRfc2822Message(draft);
    const decoded = Buffer.from(message.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

    expect(message.threadId).toBe('thr-1');
    expect(decoded).toContain('To: "Ada Lovelace" <ada@example.com>');
    expect(decoded).toContain('Content-Type: multipart/alternative;');
    expect(decoded).toContain('In-Reply-To: msg-1');
    expect(decoded).toContain('<p>Plain</p>');
  });
});
