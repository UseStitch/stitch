import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { createSseConnection, isIdle, retryDelay } from './sse-connection';

class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(name, listener as (event: MessageEvent<string>) => void);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(name: string, data: string): void {
    this.listeners.get(name)?.({ data } as MessageEvent<string>);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const OriginalEventSource = globalThis.EventSource;

beforeEach(() => {
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
});

afterEach(() => {
  globalThis.EventSource = OriginalEventSource;
});

describe('retryDelay', () => {
  it('grows exponentially from the base delay', () => {
    expect(retryDelay(0, () => 0)).toBe(500);
    expect(retryDelay(1, () => 0)).toBe(1_000);
    expect(retryDelay(2, () => 0)).toBe(2_000);
  });

  it('caps the delay so reconnects never stall indefinitely', () => {
    expect(retryDelay(99, () => 1)).toBe(30_000);
  });

  it('applies jitter within the attempt window', () => {
    expect(retryDelay(3, () => 0)).toBe(4_000);
    expect(retryDelay(3, () => 1)).toBe(8_000);
  });
});

describe('isIdle', () => {
  it('tolerates a single dropped heartbeat', () => {
    expect(isIdle(0, 30_000)).toBe(false);
  });

  it('reports idle once two heartbeat intervals have elapsed', () => {
    expect(isIdle(0, 40_000)).toBe(true);
  });
});

describe('createSseConnection', () => {
  it('ignores an obsolete URL lookup after reconnecting', async () => {
    const firstUrl = deferred<string>();
    const secondUrl = deferred<string>();
    let lookupCount = 0;
    const connection = createSseConnection({
      getUrl: () => (lookupCount++ === 0 ? firstUrl.promise : secondUrl.promise),
      onEvent: () => {},
      onStatus: () => {},
    });

    connection.reconnect();
    secondUrl.resolve('http://current');
    await flushPromises();
    firstUrl.resolve('http://obsolete');
    await flushPromises();

    expect(FakeEventSource.instances.map(({ url }) => url)).toEqual(['http://current/events']);
    connection.close();
  });

  it('ignores callbacks from a replaced EventSource', async () => {
    const statuses: string[] = [];
    const events: string[] = [];
    const connection = createSseConnection({
      getUrl: () => Promise.resolve('http://server'),
      onEvent: (_name, raw) => events.push(raw),
      onStatus: (status) => statuses.push(status),
    });
    await flushPromises();
    const replaced = FakeEventSource.instances[0];

    connection.reconnect();
    await flushPromises();
    replaced.onopen?.();
    replaced.emit('heartbeat', '{"ts":1}');

    expect(statuses).toEqual(['connecting']);
    expect(events).toEqual([]);
    connection.close();
  });
});
