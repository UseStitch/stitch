import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { GmailAttachmentSizeLimitError } from '../errors.js';
import { StubGoogleClient } from '../test-helpers.js';
import { downloadAttachments, sendMessage } from './api.js';

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

describe('gmail api', () => {
  let tempRoot: string | null = null;

  afterEach(async () => {
    if (!tempRoot) {
      return;
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  test('downloads message attachments to the configured temp path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-attachments-test-'));
    tempRoot = root;
    const request = async (url: string) => {
      if (url.includes('/messages/msg-1?format=FULL')) {
        return {
          id: 'msg-1',
          threadId: 'thread-1',
          snippet: '',
          payload: {
            mimeType: 'multipart/mixed',
            parts: [
              {
                mimeType: 'application/pdf',
                headers: [{ name: 'Content-Disposition', value: 'attachment; filename="report.pdf"' }],
                body: { size: 11, attachmentId: 'att-1' },
              },
            ],
          },
        };
      }

      if (url.includes('/messages/msg-1/attachments/att-1')) {
        return { size: 11, data: base64Url('hello world') };
      }

      throw new Error(`Unexpected URL: ${url}`);
    };
    const client = new StubGoogleClient({ request });

    const result = await downloadAttachments(client, 'msg-1', root);

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments.at(0)).toMatchObject({
      attachmentId: 'att-1',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      size: 11,
    });
    expect(result.attachments.at(0)?.path).toBe(path.join(root, 'gmail-attachments', 'msg-1', 'report.pdf'));
    expect(fs.readFile(result.attachments.at(0)?.path ?? '', 'utf8')).resolves.toBe('hello world');
  });

  test('sends local files as MIME attachments', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-send-test-'));
    tempRoot = root;
    const filePath = path.join(root, 'report.txt');
    await fs.writeFile(filePath, 'attachment contents');

    let requestBody = '';
    const client = new StubGoogleClient({
      request: async (_url: string, options?: RequestInit) => {
        if (typeof options?.body !== 'string') throw new Error('Expected a JSON request body');
        requestBody = options.body;
        return { id: 'msg-1', threadId: 'thread-1' };
      },
    });

    await sendMessage(client, 'person@example.com', 'Report', 'See attached.', {
      attachments: [{ filePath, mimeType: 'text/plain' }],
    });

    const raw = JSON.parse(requestBody).raw as string;
    const message = Buffer.from(raw, 'base64url').toString();
    expect(message).toContain('Content-Type: multipart/mixed; boundary=');
    expect(message).toContain('Content-Type: text/plain; charset="UTF-8"\r\n\r\nSee attached.');
    expect(message).toContain('Content-Disposition: attachment; filename="report.txt"');
    expect(message).toContain(Buffer.from('attachment contents').toString('base64'));
  });

  test('rejects attachments over Gmail total size limit before sending', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-send-limit-test-'));
    tempRoot = root;
    const filePath = path.join(root, 'large.bin');
    await fs.writeFile(filePath, '');
    await fs.truncate(filePath, 25 * 1024 * 1024 + 1);
    const client = new StubGoogleClient({
      request: async () => {
        throw new Error('Request should not be sent');
      },
    });

    expect(
      sendMessage(client, 'person@example.com', 'Large file', 'See attached.', { attachments: [{ filePath }] }),
    ).rejects.toBeInstanceOf(GmailAttachmentSizeLimitError);
  });
});
