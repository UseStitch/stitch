import { describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { deleteFiles, uploadFile } from './api.js';

import type { GoogleClient } from '../client.js';

describe('Drive API uploadFile', () => {
  test('uploads a local file with metadata', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-upload-test-'));
    const filePath = path.join(root, 'report.txt');
    await fs.writeFile(filePath, 'hello drive');

    let requestUrl = '';
    let requestOptions: { method?: string; headers?: Record<string, string>; body?: string | ArrayBuffer } = {};
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
    expect(requestOptions.headers?.['Content-Type']).toBe('multipart/related; boundary=drive_upload_boundary');
    const requestBody =
      typeof requestOptions.body === 'string'
        ? requestOptions.body
        : Buffer.from(new Uint8Array(requestOptions.body ?? new ArrayBuffer(0))).toString();

    expect(requestBody).toContain('hello drive');
    expect(requestBody).toContain('Content-Type: text/plain\r\n\r\nhello drive');
    expect(requestBody).toContain(JSON.stringify({ name: 'Report.txt', parents: ['folder-1'] }));
    expect(result).toEqual({
      id: 'file-1',
      name: 'Report.txt',
      mimeType: 'text/plain',
      webViewLink: 'https://drive.google.com/file/d/file-1/view',
    });
  });
});

describe('Drive API deleteFiles', () => {
  test('deletes multiple files', async () => {
    let requestUrl = '';
    let requestOptions: RequestInit | undefined;
    const client = {
      requestRaw: async (url: string, options?: RequestInit) => {
        requestUrl = url;
        requestOptions = options;
        return new Response(
          [
            '--response',
            'Content-Type: application/http',
            '',
            'HTTP/1.1 204 No Content',
            '',
            '--response',
            'Content-Type: application/http',
            '',
            'HTTP/1.1 204 No Content',
            '',
            '--response--',
          ].join('\r\n'),
        );
      },
    } as unknown as GoogleClient;

    const result = await deleteFiles(client, ['file-1', 'file/2']);

    expect(requestUrl).toBe('https://www.googleapis.com/batch/drive/v3');
    expect(requestOptions?.method).toBe('POST');
    expect(requestOptions?.headers).toEqual({
      'Content-Type': expect.stringContaining('multipart/mixed; boundary=drive_delete_'),
    });
    expect(requestOptions?.body).toContain('DELETE /drive/v3/files/file-1?supportsAllDrives=true HTTP/1.1');
    expect(requestOptions?.body).toContain('DELETE /drive/v3/files/file%2F2?supportsAllDrives=true HTTP/1.1');
    expect(result).toEqual({ deletedFileIds: ['file-1', 'file/2'] });
  });

  test('reports failed inner delete requests', async () => {
    const client = {
      requestRaw: async () =>
        new Response(
          ['--response', 'Content-Type: application/http', '', 'HTTP/1.1 404 Not Found', '', '--response--'].join(
            '\r\n',
          ),
        ),
    } as unknown as GoogleClient;

    expect(deleteFiles(client, ['missing-file'])).rejects.toEqual(
      expect.objectContaining({ failures: [{ fileId: 'missing-file', status: 404 }] }),
    );
  });
});
