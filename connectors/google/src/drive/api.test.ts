import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'bun:test';

import { uploadFile } from './api.js';

import type { GoogleClient } from '../client.js';

describe('Drive API uploadFile', () => {
  test('uploads a local file with metadata', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-upload-test-'));
    const filePath = path.join(root, 'report.txt');
    await fs.writeFile(filePath, 'hello drive');

    let requestUrl = '';
    let requestOptions: {
      method?: string;
      headers?: Record<string, string>;
      body?: string | ArrayBuffer;
    } = {};
    const client = {
      request: async (url: string, options?: typeof requestOptions) => {
        requestUrl = url;
        requestOptions = options ?? {};
        return {
          id: 'file-1',
          name: 'Report.txt',
          mimeType: 'text/plain',
          webViewLink: 'https://drive.google.com/file/d/file-1/view',
        };
      },
    } as unknown as GoogleClient;

    const result = await uploadFile(client, filePath, {
      name: 'Report.txt',
      mimeType: 'text/plain',
      parentId: 'folder-1',
    });

    expect(requestUrl).toBe(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
    );
    expect(requestOptions.method).toBe('POST');
    expect(requestOptions.headers?.['Content-Type']).toBe(
      'multipart/related; boundary=drive_upload_boundary',
    );
    const requestBody =
      typeof requestOptions.body === 'string'
        ? requestOptions.body
        : Buffer.from(new Uint8Array(requestOptions.body ?? new ArrayBuffer(0))).toString();

    expect(requestBody).toContain('hello drive');
    expect(requestBody).toContain(
      JSON.stringify({ name: 'Report.txt', parents: ['folder-1'] }),
    );
    expect(result).toEqual({
      id: 'file-1',
      name: 'Report.txt',
      mimeType: 'text/plain',
      webViewLink: 'https://drive.google.com/file/d/file-1/view',
    });
  });
});
