import type {
  ElectronBrowserCommand,
  ElectronBrowserDialogState,
  ElectronBrowserErrorMessage,
  ElectronBrowserExecutionState,
  ElectronBrowserResultMessage,
} from '@stitch/shared/browser/electron';

import type {
  BrowserTab,
  DropdownOptionsResult,
  ExtractContentResult,
  FindElementsResult,
  LaunchOptions,
  ScreenshotResult,
  ScrollDirection,
  SearchPageResult,
} from '@/lib/browser/types.js';

const BRIDGE_HOST = '127.0.0.1';
const REQUEST_TIMEOUT_MS = 30_000;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

class DesktopBrowserBridge {
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private pending = new Map<string, PendingRequest>();

  async send(
    command: ElectronBrowserCommand,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    await this.connect();
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(
        'Desktop browser bridge is not connected. Browser tools require the Stitch desktop app.',
      );
    }

    const id = crypto.randomUUID();
    const message = JSON.stringify({ id, type: 'browser:command', sessionId, command });

    return new Promise((resolve, reject) => {
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
        resolve: (value) => {
          signal?.removeEventListener('abort', abort);
          resolve(value);
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
      throw new Error(
        'Browser tools require the Stitch desktop app. No desktop browser bridge is configured.',
      );
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
  private _sessionId: string | null = null;

  set sessionId(id: string) {
    this._sessionId = id;
  }

  private getSessionId(): string {
    if (!this._sessionId)
      throw new Error('Browser sessionId must be set before executing commands.');
    return this._sessionId;
  }

  private send(command: ElectronBrowserCommand, signal?: AbortSignal): Promise<unknown> {
    return this.bridge.send(command, this.getSessionId(), signal);
  }

  async launch(_options: LaunchOptions = {}): Promise<void> {
    await this.send({ action: 'ensure' });
  }

  async close(): Promise<void> {
    return;
  }

  async handleDialog(
    action: 'accept' | 'dismiss',
    promptText?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return String(
      await this.send({ action: 'handleDialog', dialogAction: action, promptText }, signal),
    );
  }

  async getDialogState(signal?: AbortSignal): Promise<ElectronBrowserDialogState> {
    return (await this.send({ action: 'dialogState' }, signal)) as ElectronBrowserDialogState;
  }

  async getExecutionState(signal?: AbortSignal): Promise<string> {
    const state = (await this.send(
      { action: 'executionState' },
      signal,
    )) as ElectronBrowserExecutionState;
    return JSON.stringify(state);
  }

  async saveStorageState() {
    return { path: null, note: 'Storage is persisted by the Electron browser partition.' };
  }

  async loadStorageState() {
    return { path: null, note: 'Storage is persisted by the Electron browser partition.' };
  }

  async listTabs(signal?: AbortSignal): Promise<BrowserTab[]> {
    return (await this.send({ action: 'listTabs' }, signal)) as BrowserTab[];
  }

  async newTab(
    url?: string,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<BrowserTab> {
    await this.send({ action: 'newTab', url, timeoutMs: options.timeoutMs }, options.signal);
    const tabs = await this.listTabs(options.signal);
    return tabs.find((tab) => tab.type === 'page') ?? tabs[0];
  }

  async focusTab(
    tabId: string,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<void> {
    await this.send({ action: 'focusTab', tabId, timeoutMs: options.timeoutMs }, options.signal);
  }

  async closeTab(tabId?: string, signal?: AbortSignal): Promise<void> {
    await this.send({ action: 'closeTab', tabId }, signal);
  }

  async navigate(url: string, signal?: AbortSignal, timeoutMs?: number): Promise<string> {
    return String(await this.send({ action: 'navigate', url, timeoutMs }, signal));
  }

  async goBack(signal?: AbortSignal, timeoutMs?: number): Promise<string> {
    return String(await this.send({ action: 'goBack', timeoutMs }, signal));
  }

  async goForward(signal?: AbortSignal, timeoutMs?: number): Promise<string> {
    return String(await this.send({ action: 'goForward', timeoutMs }, signal));
  }

  async click(
    ref: string,
    options: {
      doubleClick?: boolean;
      button?: string;
      modifiers?: string[];
      signal?: AbortSignal;
      timeoutMs?: number;
    } = {},
  ): Promise<string> {
    return String(await this.send({ action: 'click', ref, ...options }, options.signal));
  }

  async hover(ref: string, signal?: AbortSignal): Promise<string> {
    return String(await this.send({ action: 'hover', ref }, signal));
  }

  async type(
    ref: string,
    text: string,
    options: { slowly?: boolean; submit?: boolean; clear?: boolean; signal?: AbortSignal } = {},
  ): Promise<string> {
    return String(await this.send({ action: 'type', ref, text, ...options }, options.signal));
  }

  async press(key: string, signal?: AbortSignal, timeoutMs?: number): Promise<string> {
    return String(await this.send({ action: 'press', key, timeoutMs }, signal));
  }

  async select(ref: string, values: string[], signal?: AbortSignal): Promise<string> {
    return String(await this.send({ action: 'select', ref, values }, signal));
  }

  async getDropdownOptions(ref: string, signal?: AbortSignal): Promise<DropdownOptionsResult> {
    return (await this.send(
      { action: 'getDropdownOptions', ref },
      signal,
    )) as DropdownOptionsResult;
  }

  async selectDropdown(
    ref: string,
    text: string,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<string> {
    return String(await this.send({ action: 'selectDropdown', ref, text, timeoutMs }, signal));
  }

  async scroll(
    ref: string | undefined,
    direction: ScrollDirection,
    signal?: AbortSignal,
  ): Promise<string> {
    return String(await this.send({ action: 'scroll', ref, direction }, signal));
  }

  async snapshot(signal?: AbortSignal): Promise<string> {
    return String(await this.send({ action: 'snapshot' }, signal));
  }

  async screenshot(
    options: {
      signal?: AbortSignal;
      format?: 'png' | 'jpeg' | 'webp';
      quality?: number;
      fullPage?: boolean;
      ref?: string;
    } = {},
  ): Promise<ScreenshotResult> {
    return (await this.send(
      { action: 'screenshot', ...options },
      options.signal,
    )) as ScreenshotResult;
  }

  async evaluate(expression: string, signal?: AbortSignal): Promise<unknown> {
    return this.send({ action: 'evaluate', expression }, signal);
  }

  async searchPage(
    options: {
      pattern: string;
      regex?: boolean;
      caseSensitive?: boolean;
      contextChars?: number;
      cssScope?: string;
      maxResults?: number;
    },
    signal?: AbortSignal,
  ): Promise<SearchPageResult> {
    return (await this.send({ action: 'searchPage', ...options }, signal)) as SearchPageResult;
  }

  async findElements(
    options: {
      selector: string;
      attributes?: string[];
      maxResults?: number;
      includeText?: boolean;
    },
    signal?: AbortSignal,
  ): Promise<FindElementsResult> {
    return (await this.send({ action: 'findElements', ...options }, signal)) as FindElementsResult;
  }

  async resize(width: number, height: number, signal?: AbortSignal): Promise<string> {
    return String(await this.send({ action: 'resize', width, height }, signal));
  }

  async wait(timeMs?: number, selector?: string, signal?: AbortSignal): Promise<string> {
    return String(await this.send({ action: 'wait', timeMs, selector }, signal));
  }

  async search(
    query: string,
    engine = 'google',
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<string> {
    return String(await this.send({ action: 'search', query, engine, timeoutMs }, signal));
  }

  async extractPageContent(
    signal?: AbortSignal,
    options: {
      selector?: string;
      includeLinks?: boolean;
      includeImages?: boolean;
      outputSchema?: Record<string, unknown>;
    } = {},
  ): Promise<string | ExtractContentResult> {
    const result = await this.send({ action: 'extractPageContent', ...options }, signal);
    return typeof result === 'string' ? result : (result as ExtractContentResult);
  }
}

let singleton: BrowserManager | null = null;

export function getBrowserManager(sessionId?: string): BrowserManager {
  singleton ??= new BrowserManager();
  if (sessionId) singleton.sessionId = sessionId;
  return singleton;
}
