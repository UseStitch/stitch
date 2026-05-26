import { describe, expect, test } from 'bun:test';

import { CDPClient } from '@/lib/browser/cdp-client.js';

describe('CDPClient.send abort', () => {
  test('throws AbortError immediately when signal is already aborted', async () => {
    const client = new CDPClient();
    const controller = new AbortController();
    controller.abort();

    let err: unknown;
    try { await client.send('Page.enable', {}, controller.signal); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe('AbortError');
  });

  test('throws AbortError when signal fires after send is queued', async () => {
    const fakeWs = {
      send: () => {},
      close: () => {},
      addEventListener: () => {},
    };

    const client = new CDPClient();
    (client as unknown as Record<string, unknown>)['ws'] = fakeWs;
    (client as unknown as Record<string, unknown>)['closed'] = false;

    const controller = new AbortController();
    const sendPromise = client.send('Page.enable', {}, controller.signal);

    controller.abort();

    let err: unknown;
    try { await sendPromise; } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe('AbortError');
  });
});
