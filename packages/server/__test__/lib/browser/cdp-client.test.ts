import { describe, expect, test } from 'vitest';

import { CDPClient } from '@/lib/browser/cdp-client.js';

describe('CDPClient.send abort', () => {
  test('throws AbortError immediately when signal is already aborted', async () => {
    const client = new CDPClient();
    const controller = new AbortController();
    controller.abort();

    // Send without a live WebSocket — but the abort check happens before the WS check
    // We need to bypass the connection check, so we test via the public contract:
    // a pre-aborted signal should reject with AbortError before WS send.
    // We create a minimal stub by connecting to nothing but skip the check by
    // testing only the abort path via an already-aborted signal before connect.
    await expect(
      client.send('Page.enable', {}, controller.signal),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
    );
  });

  test('throws AbortError when signal fires after send is queued', async () => {
    // Build a minimal fake WS that never responds
    const fakeWs = {
      send: () => {},
      close: () => {},
      addEventListener: () => {},
    };

    const client = new CDPClient();
    // Inject the fake ws via the private field (reflection workaround for testing)
    (client as unknown as Record<string, unknown>)['ws'] = fakeWs;
    (client as unknown as Record<string, unknown>)['closed'] = false;

    const controller = new AbortController();
    const sendPromise = client.send('Page.enable', {}, controller.signal);

    controller.abort();

    await expect(sendPromise).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
    );
  });
});
