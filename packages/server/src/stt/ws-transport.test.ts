import { afterEach, describe, expect, test } from 'bun:test';

import { createWsTransport } from '@/stt/ws-transport.js';

type Listener = (event: Event) => void;

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static last: FakeWebSocket | null = null;

  readyState = FakeWebSocket.CONNECTING;
  sent: Array<string | Uint8Array> = [];
  pingCount = 0;
  closeCode: number | null = null;
  listenerCount = 0;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(
    readonly url: string,
    readonly init: unknown,
  ) {
    FakeWebSocket.last = this;
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    this.listenerCount++;
  }

  removeEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type);
    if (!listeners?.delete(listener)) return;
    this.listenerCount--;
  }

  send(message: string | Uint8Array): void {
    this.sent.push(message);
  }

  ping(): void {
    this.pingCount++;
  }

  close(code: number): void {
    this.closeCode = code;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', { code, reason: 'closed' });
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open', {});
  }

  message(data: string): void {
    this.emit('message', { data });
  }

  pong(): void {
    this.emit('pong', {});
  }

  private emit(type: string, props: Record<string, unknown>): void {
    const event = Object.assign(new Event(type), props);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const originalWebSocket = globalThis.WebSocket;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  FakeWebSocket.last = null;
});

describe('createWsTransport', () => {
  test('emits a typed error and closes when a pong is missing', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const transportPromise = createWsTransport(
      {
        url: 'wss://example.test/stt',
        headers: {},
        parseMessage: () => null,
        label: 'Test',
        pingIntervalMs: 5,
        pongTimeoutMs: 5,
      },
      () => 'audio',
      () => 'commit',
    );
    FakeWebSocket.last?.open();
    const transport = await transportPromise;
    const errors: Error[] = [];
    transport.onError((err) => errors.push(err));

    await sleep(20);

    expect(errors[0]?.message).toBe('Test WebSocket missing pong');
    expect((errors[0] as Error & { code?: string })?.code).toBe('missing-pong');
    expect(FakeWebSocket.last?.closeCode).toBe(4000);
  });

  test('removes listeners and stops keepalive on close', async () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    const transportPromise = createWsTransport(
      {
        url: 'wss://example.test/stt',
        headers: {},
        parseMessage: () => null,
        label: 'Test',
        pingIntervalMs: 100,
        pongTimeoutMs: 100,
      },
      () => 'audio',
      () => 'commit',
    );
    FakeWebSocket.last?.open();
    const socket = FakeWebSocket.last!;
    const transport = await transportPromise;

    expect(socket.listenerCount).toBeGreaterThan(0);
    await transport.close();

    expect(socket.listenerCount).toBe(0);
    expect(socket.closeCode).toBe(1000);
  });
});
