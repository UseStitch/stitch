import type {
  ElectronBrowserCommand,
  ElectronBrowserCommandResult,
  ElectronBrowserErrorMessage,
  ElectronBrowserResultMessage,
} from '@stitch/shared/browser/electron';
import type { PrefixedString } from '@stitch/shared/id';

import {
  BrowserBridgeNotConfiguredError,
  BrowserBridgeNotConnectedError,
  BrowserSessionNotSetError,
} from '@/lib/browser/errors.js';

const BRIDGE_HOST = '127.0.0.1';
const REQUEST_TIMEOUT_MS = 30_000;

type PendingRequest = { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout };

class DesktopBrowserBridge {
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private pending = new Map<string, PendingRequest>();

  async send<C extends ElectronBrowserCommand>(
    command: C,
    sessionId: PrefixedString<'ses'>,
    signal?: AbortSignal,
  ): Promise<ElectronBrowserCommandResult<C['action']>> {
    await this.connect();
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new BrowserBridgeNotConnectedError();
    }

    const id = crypto.randomUUID();
    const message = JSON.stringify({ id, type: 'browser:command', sessionId, command });

    return new Promise<ElectronBrowserCommandResult<C['action']>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser command timed out: ${command.action}`));
      }, REQUEST_TIMEOUT_MS);

      const abort = () => {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(new DOMException('Browser command aborted', 'AbortError'));
      };

      if (signal?.aborted) {
        abort();
        return;
      }

      signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(id, {
        // The WebSocket payload is untyped JSON; this is the single boundary where
        // the wire result is trusted to match the command's mapped result type.
        resolve: (value) => {
          signal?.removeEventListener('abort', abort);
          resolve(value as ElectronBrowserCommandResult<C['action']>);
        },
        reject: (error) => {
          signal?.removeEventListener('abort', abort);
          reject(error);
        },
        timeout,
      });

      socket.send(message);
    });
  }

  private async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;

    const port = process.env.STITCH_BROWSER_BRIDGE_PORT;
    if (!port) {
      throw new BrowserBridgeNotConfiguredError();
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`ws://${BRIDGE_HOST}:${port}`);

      socket.addEventListener('open', () => {
        this.socket = socket;
        this.connectPromise = null;
        resolve();
      });

      socket.addEventListener('message', (event) => this.handleMessage(String(event.data)));

      socket.addEventListener('close', () => {
        this.socket = null;
        this.rejectAll(new Error('Desktop browser bridge disconnected.'));
      });

      socket.addEventListener('error', () => {
        this.connectPromise = null;
        reject(new Error('Failed to connect to the desktop browser bridge.'));
      });
    });

    return this.connectPromise;
  }

  private handleMessage(raw: string): void {
    const message = JSON.parse(raw) as ElectronBrowserResultMessage | ElectronBrowserErrorMessage;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(message.id);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error));
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

class BrowserManager {
  private bridge = new DesktopBrowserBridge();
  private _sessionId: PrefixedString<'ses'> | null = null;

  set sessionId(id: PrefixedString<'ses'>) {
    this._sessionId = id;
  }

  private getSessionId(): PrefixedString<'ses'> {
    if (!this._sessionId) throw new BrowserSessionNotSetError();
    return this._sessionId;
  }

  send<C extends ElectronBrowserCommand>(
    command: C,
    signal?: AbortSignal,
  ): Promise<ElectronBrowserCommandResult<C['action']>> {
    return this.bridge.send(command, this.getSessionId(), signal);
  }

  async launch(): Promise<void> {
    await this.send({ action: 'ensure' });
  }
}

let singleton: BrowserManager | null = null;

export function getBrowserManager(sessionId?: PrefixedString<'ses'>): BrowserManager {
  singleton ??= new BrowserManager();
  if (sessionId) singleton.sessionId = sessionId;
  return singleton;
}

export function sendBrowserCommand<C extends ElectronBrowserCommand>(
  command: C,
  signal?: AbortSignal,
): Promise<ElectronBrowserCommandResult<C['action']>> {
  return getBrowserManager().send(command, signal);
}
