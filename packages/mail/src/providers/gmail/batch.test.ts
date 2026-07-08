import { describe, expect, test } from 'bun:test';

import type { MailProviderContext } from '../../contracts.js';
import { createGmailBatchRequestBodyForTests, gmailBatchRequest, parseGmailBatchResponse } from './batch.js';

function createContext(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): MailProviderContext {
  return {
    account: {} as MailProviderContext['account'],
    http: { request: async (url, init) => handler(url, init) },
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    signal: new AbortController().signal,
  };
}

describe('gmailBatchRequest', () => {
  test('builds multipart request bodies', () => {
    const body = createGmailBatchRequestBodyForTests('boundary', [
      { id: 'msg-1', method: 'GET', path: '/messages/msg-1?format=full' },
    ]);

    expect(body).toContain('--boundary\r\nContent-Type: application/http');
    expect(body).toContain('Content-ID: <msg-1>');
    expect(body).toContain('GET /messages/msg-1?format=full HTTP/1.1');
    expect(body.endsWith('--boundary--\r\n')).toBe(true);
  });

  test('parses multipart response status and JSON bodies', () => {
    const responseBody = [
      '--batch_x',
      'Content-Type: application/http',
      'Content-ID: <response-msg-1>',
      '',
      'HTTP/1.1 200 OK',
      'Content-Type: application/json; charset=UTF-8',
      '',
      '{"id":"msg-1"}',
      '--batch_x',
      'Content-Type: application/http',
      'Content-ID: <response-msg-2>',
      '',
      'HTTP/1.1 404 Not Found',
      'Content-Type: application/json; charset=UTF-8',
      '',
      '{"error":{"message":"missing"}}',
      '--batch_x--',
      '',
    ].join('\r\n');

    expect(parseGmailBatchResponse('multipart/mixed; boundary=batch_x', responseBody)).toEqual([
      { id: 'msg-1', status: 200, body: { id: 'msg-1' } },
      { id: 'msg-2', status: 404, body: { error: { message: 'missing' } } },
    ]);
  });

  test('posts to Gmail batch endpoint and returns parsed items', async () => {
    const ctx = createContext((_url, init) => {
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('content-type')).toContain('multipart/mixed; boundary=');
      expect(init?.body as string).toContain('GET /messages/msg-1?format=metadata HTTP/1.1');
      return new Response(
        [
          '--batch_y',
          'Content-Type: application/http',
          'Content-ID: <response-msg-1>',
          '',
          'HTTP/1.1 200 OK',
          'Content-Type: application/json',
          '',
          '{"id":"msg-1"}',
          '--batch_y--',
          '',
        ].join('\r\n'),
        { headers: { 'Content-Type': 'multipart/mixed; boundary=batch_y' } },
      );
    });

     expect(
      gmailBatchRequest(ctx, [{ id: 'msg-1', method: 'GET', path: '/messages/msg-1?format=metadata' }]),
    ).resolves.toEqual([{ id: 'msg-1', status: 200, body: { id: 'msg-1' } }]);
  });
});
