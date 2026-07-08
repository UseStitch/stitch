import { describe, expect, test } from 'bun:test';

import { parseGmailMessage, type GmailMessage, type GmailMessagePart } from './parse.js';

function b64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function message(payload: GmailMessagePart): GmailMessage {
  return {
    id: 'msg-1',
    threadId: 'thr-1',
    labelIds: ['INBOX', 'UNREAD'],
    snippet: 'snippet',
    internalDate: '1710000000000',
    payload: {
      ...payload,
      headers: [
        { name: 'From', value: '"Ada Lovelace" <ada@example.com>' },
        { name: 'To', value: 'Grace <grace@example.com>, alan@example.com' },
        { name: 'Cc', value: 'cc@example.com' },
        { name: 'Subject', value: 'Test subject' },
        { name: 'Message-ID', value: '<rfc-1@example.com>' },
        { name: 'In-Reply-To', value: '<parent@example.com>' },
        { name: 'References', value: '<root@example.com> <parent@example.com>' },
        ...(payload.headers ?? []),
      ],
    },
  };
}

describe('parseGmailMessage', () => {
  test('normalizes plain text messages', () => {
    const parsed = parseGmailMessage(message({ mimeType: 'text/plain', body: { data: b64('hello'), size: 5 } }), 'full');

    expect(parsed).toMatchObject({
      providerMessageId: 'msg-1',
      providerThreadId: 'thr-1',
      from: { name: 'Ada Lovelace', email: 'ada@example.com' },
      to: [
        { name: 'Grace', email: 'grace@example.com' },
        { name: null, email: 'alan@example.com' },
      ],
      cc: [{ name: null, email: 'cc@example.com' }],
      subject: 'Test subject',
      internalDate: 1710000000000,
      labelProviderIds: ['INBOX', 'UNREAD'],
      bodyText: 'hello',
      bodyHtml: null,
      hydration: 'full',
      headers: { messageId: '<rfc-1@example.com>', inReplyTo: '<parent@example.com>' },
    });
  });

  test('normalizes html and nested multipart bodies', () => {
    const parsed = parseGmailMessage(
      message({
        mimeType: 'multipart/mixed',
        body: { size: 0 },
        parts: [
          {
            mimeType: 'multipart/alternative',
            body: { size: 0 },
            parts: [
              { mimeType: 'text/plain', body: { data: b64('plain'), size: 5 } },
              { mimeType: 'text/html', body: { data: b64('<p>plain</p>'), size: 12 } },
            ],
          },
        ],
      }),
      'full',
    );

    expect(parsed.bodyText).toBe('plain');
    expect(parsed.bodyHtml).toBe('<p>plain</p>');
  });

  test('extracts attachment metadata recursively', () => {
    const parsed = parseGmailMessage(
      message({
        mimeType: 'multipart/mixed',
        body: { size: 0 },
        parts: [
          { mimeType: 'text/plain', body: { data: b64('with attachment'), size: 15 } },
          {
            mimeType: 'application/pdf',
            filename: 'file.pdf',
            headers: [{ name: 'Content-Disposition', value: 'attachment; filename="file.pdf"' }],
            body: { attachmentId: 'att-1', size: 42 },
          },
        ],
      }),
      'full',
    );

    expect(parsed.attachments).toEqual([
      { providerAttachmentId: 'att-1', filename: 'file.pdf', mimeType: 'application/pdf', sizeBytes: 42 },
    ]);
  });

  test('keeps body null for metadata hydration and tolerates missing headers', () => {
    const parsed = parseGmailMessage({ id: 'msg-2', threadId: 'thr-2' }, 'metadata');

    expect(parsed.from).toBeNull();
    expect(parsed.to).toEqual([]);
    expect(parsed.subject).toBeNull();
    expect(parsed.bodyText).toBeNull();
    expect(parsed.bodyHtml).toBeNull();
    expect(parsed.attachments).toEqual([]);
  });
});
