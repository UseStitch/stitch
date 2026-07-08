import { describe, expect, test } from 'bun:test';

import { getMailProvider, registerMailProvider } from './registry.js';

import type { MailProviderModule } from './contracts.js';

const module: MailProviderModule = {
  sync: {
    id: 'gmail',
    listLabels: async () => [],
    snapshotCursor: async () => 'cursor',
    backfillPage: async () => ({ threads: [], nextPageCursor: undefined }),
    incrementalSync: async () => ({ status: 'ok', changes: [], nextSyncCursor: 'cursor' }),
    listThreadsSince: async () => [],
    getThread: async () => null,
    fetchAttachment: async () => new Uint8Array(),
  },
  ops: {
    id: 'gmail',
    send: async () => ({ providerMessageId: 'message', providerThreadId: 'thread' }),
    createDraft: async () => ({ providerDraftId: 'draft' }),
    updateDraft: async () => {},
    deleteDraft: async () => {},
    sendDraft: async () => ({ providerMessageId: 'message', providerThreadId: 'thread' }),
    trashThread: async () => {},
    untrashThread: async () => {},
    modifyMessageLabels: async () => {},
  },
};

describe('mail provider registry', () => {
  test('registers and resolves providers', () => {
    registerMailProvider(module);
    expect(getMailProvider('gmail')).toBe(module);
  });
});
