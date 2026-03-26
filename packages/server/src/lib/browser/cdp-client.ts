import type { CDPEvent, CDPMessage, CDPRequest, CDPResponse } from '@/lib/browser/types.js';

type PendingRequest = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

type EventHandler = (params: Record<string, unknown>) => void;

const CDP_TIMEOUT_MS = 30_000;

export class CDPClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private listeners = new Map<string, Set<EventHandler>>();
  private sessionId: string | undefined;
  private closed = false;

  async connect(wsUrl: string): Promise<void> {
    if (this.ws) {
      throw new Error('CDPClient is already connected');
    }

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new Error(`CDP WebSocket connection timed out after ${CDP_TIMEOUT_MS}ms`));
        }
      }, CDP_TIMEOUT_MS);

      ws.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.ws = ws;
        resolve();
      });

      ws.addEventListener('error', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('CDP WebSocket connection failed'));
          return;
        }
        this.handleDisconnect();
      });

      ws.addEventListener('close', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('CDP WebSocket closed before connection established'));
          return;
        }
        this.handleDisconnect();
      });

      ws.addEventListener('message', (event) => {
        this.handleMessage(String(event.data));
      });
    });
  }

  async send(method: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (signal?.aborted) {
      throw new DOMException('CDP request aborted', 'AbortError');
    }

    if (!this.ws || this.closed) {
      throw new Error('CDPClient is not connected');
    }

    const id = this.nextId++;
    const request: CDPRequest = { id, method };

    if (params) {
      request.params = params;
    }
    if (this.sessionId) {
      request.sessionId = this.sessionId;
    }

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        this.pending.delete(id);
      };

      const onAbort = () => {
        cleanup();
        reject(new DOMException('CDP request aborted', 'AbortError'));
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`CDP request timed out: ${method} (id=${id})`));
      }, CDP_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (result) => {
          cleanup();
          resolve(result);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      });

      signal?.addEventListener('abort', onAbort, { once: true });
      this.ws!.send(JSON.stringify(request));
    });
  }

  on(event: string, handler: EventHandler): void {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  close(): void {
    this.closed = true;
    for (const [id, pending] of this.pending) {
      pending.reject(new Error('CDPClient closed'));
      this.pending.delete(id);
    }
    this.listeners.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws !== null && !this.closed;
  }

  private handleMessage(data: string): void {
    let message: CDPMessage;
    try {
      message = JSON.parse(data) as CDPMessage;
    } catch {
      return;
    }

    if ('id' in message && typeof message.id === 'number') {
      this.handleResponse(message);
    } else if ('method' in message) {
      this.handleEvent(message);
    }
  }

  private handleResponse(response: CDPResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;

    this.pending.delete(response.id);

    if (response.error) {
      const errorMessage = response.error.data
        ? `${response.error.message}: ${response.error.data}`
        : response.error.message;
      pending.reject(new Error(`CDP error (${response.error.code}): ${errorMessage}`));
    } else {
      pending.resolve(response.result ?? {});
    }
  }

  private handleEvent(event: CDPEvent): void {
    const handlers = this.listeners.get(event.method);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(event.params ?? {});
      } catch {
        // Swallow handler errors to avoid breaking the message loop
      }
    }
  }

  private handleDisconnect(): void {
    this.closed = true;
    for (const [, pending] of this.pending) {
      pending.reject(new Error('CDP WebSocket disconnected'));
    }
    this.pending.clear();
    this.ws = null;
  }
}
