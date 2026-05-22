import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadAttachments } from '../gmail/api.js';

import type { GoogleClient } from '../client.js';

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

describe('gmail api', () => {
  let tempRoot: string | null = null;

  afterEach(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it('downloads message attachments to the configured temp path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-attachments-test-'));
    tempRoot = root;
    const request = vi.fn(async (url: string) => {
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
    });
    const client = { request } as unknown as GoogleClient;

    const result = await downloadAttachments(client, 'msg-1', root);

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]).toMatchObject({
      attachmentId: 'att-1',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      size: 11,
    });
    expect(result.attachments[0]?.path).toBe(
      path.join(root, 'gmail-attachments', 'msg-1', 'report.pdf'),
    );
    await expect(fs.readFile(result.attachments[0]?.path ?? '', 'utf8')).resolves.toBe('hello world');
  });
});
