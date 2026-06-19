import { shell, webContents, type BrowserWindow, type WebContents } from 'electron';

import type {
  ElectronBrowserCommand,
  ElectronBrowserCommandResultValue,
  ElectronBrowserDialogState,
  ElectronBrowserDownload,
  ElectronBrowserState,
} from '@stitch/shared/browser/electron';

import { isAuthPopupUrl } from './auth-popups.js';
import { BrowserBridge } from './bridge.js';
import { executeBrowserCommand } from './command-handlers.js';
import { ControlArbiter } from './control.js';
import { DownloadTracker } from './downloads.js';
import { waitForNonEmptyHttpPage } from './page-stability.js';
import { RefResolver } from './ref-resolver.js';
import { DIALOG_INTERCEPT_SCRIPT, DIALOG_SIGNAL } from './scripts/dialogs.injected.js';
import { buildSnapshotScript } from './scripts/snapshot.injected.js';
import { WEBAUTHN_INTERCEPT_SCRIPT, WEBAUTHN_SIGNAL } from './scripts/webauthn.injected.js';
import { SessionStore } from './session-store.js';
import { normalizeUrl } from './url.js';

import type { RefEntry } from './types.js';

const DEFAULT_URL = 'about:blank';
const BROWSER_READY_TIMEOUT_MS = 20_000;
const BROWSER_READY_POLL_MS = 50;

export class ElectronBrowserManager {
  private browser: WebContents | null = null;
  private registeredWebContentsId: number | null = null;
  private readonly store = new SessionStore(() => this.broadcastState());
  private readonly refResolver = new RefResolver(() => this.waitForBrowser());
  private readonly control = new ControlArbiter(() => this.broadcastState());
  private readonly downloads = new DownloadTracker(() => this.broadcastState());
  private dialogState: ElectronBrowserDialogState = { open: false };
  private readonly bridge = new BrowserBridge((sessionId, command) =>
    this.handleBridgeCommand(sessionId, command),
  );

  constructor(private readonly windowGetter: () => BrowserWindow | null) {}

  startBridge(port: number): void {
    this.bridge.start(port);
  }

  stopBridge(): void {
    this.bridge.stop();
  }

  switchSession(sessionId: string): ElectronBrowserState {
    if (sessionId === this.store.getCurrentSessionId()) return this.getState();
    this.store.switchSession(sessionId);
    const activeTab = this.store.getActiveTab();
    if (
      this.browser &&
      !this.browser.isDestroyed() &&
      activeTab?.url &&
      activeTab.url !== DEFAULT_URL
    ) {
      void this.browser.loadURL(activeTab.url);
    }
    this.broadcastState();
    return this.getState();
  }

  persistToDisk(): void {
    this.store.persistToDisk();
  }

  registerWebview(webContentsId: number, sessionId: string): ElectronBrowserState {
    const contents = webContents.fromId(webContentsId);
    if (!contents) throw new Error(`Browser webview ${webContentsId} was not found`);

    if (
      this.registeredWebContentsId === webContentsId &&
      this.browser &&
      !this.browser.isDestroyed()
    ) {
      if (sessionId !== this.store.getCurrentSessionId()) {
        this.switchSession(sessionId);
      }
      return this.getState();
    }

    this.browser = contents;
    this.registeredWebContentsId = webContentsId;
    this.store.loadSessionTabs(sessionId);

    const activeTab = this.store.getActiveTab();
    if (activeTab?.url && activeTab.url !== DEFAULT_URL) {
      void contents.loadURL(activeTab.url);
    } else {
      this.store.ensureInitialTab(contents.getURL());
    }

    contents.on('did-navigate', () => this.updateTabFromContents());
    contents.on('did-navigate-in-page', () => this.updateTabFromContents());
    contents.on('page-title-updated', () => this.updateTabFromContents());
    contents.on('render-process-gone', () => this.broadcastState());
    contents.session.on('will-download', (_event, item) => this.downloads.handleDownload(item));

    contents.setWindowOpenHandler(({ url }) => {
      if (isAuthPopupUrl(url)) {
        this.dialogState = {
          open: false,
          type: 'popup',
          message: 'Authentication popup opened in the system browser.',
          url,
          disposition: 'external',
        };
        void shell.openExternal(url);
        return { action: 'deny' };
      }
      this.dialogState = {
        open: true,
        type: 'popup',
        message: 'Page requested a popup window.',
        url,
        disposition: 'pending',
      };
      return { action: 'deny' };
    });

    contents.on('dom-ready', () => this.injectBrowserScripts(contents));
    contents.on('did-finish-load', () => this.injectBrowserScripts(contents));
    contents.on('will-prevent-unload', (event) => {
      this.dialogState = {
        open: false,
        type: 'beforeunload',
        message: 'Page attempted to block navigation with beforeunload.',
        url: contents.getURL(),
        disposition: 'auto-dismissed',
      };
      event.preventDefault();
    });

    contents.on('console-message', (_event, _level, message) => {
      if (message.startsWith(DIALOG_SIGNAL)) {
        this.recordDialogMessage(message.slice(DIALOG_SIGNAL.length));
        return;
      }
      if (message.startsWith(WEBAUTHN_SIGNAL)) {
        const url = message.slice(WEBAUTHN_SIGNAL.length);
        void shell.openExternal(url || contents.getURL());
      }
    });

    this.broadcastState();
    return this.getState();
  }

  getState(): ElectronBrowserState {
    return this.store.getState(this.downloads.list(), this.control.getController());
  }

  requestShow(): ElectronBrowserState {
    this.windowGetter()?.webContents.send('browser:show-requested');
    return this.getState();
  }

  recordHumanInput(): void {
    this.control.recordHumanInput();
  }

  async execute(command: ElectronBrowserCommand): Promise<ElectronBrowserCommandResultValue> {
    if (command.action === 'state') return this.getState();
    if (command.action === 'ensure') return this.requestShow();
    this.requestShow();
    return this.control.withAgentControl(() => this.executeWithBrowser(command));
  }

  async userNavigate(url: string): Promise<{ url: string }> {
    this.recordHumanInput();
    const browser = await this.waitForBrowser();
    await browser.loadURL(normalizeUrl(url));
    return { url: browser.getURL() };
  }

  async userGoBack(): Promise<void> {
    this.recordHumanInput();
    const browser = await this.waitForBrowser();
    if (browser.navigationHistory.canGoBack()) browser.navigationHistory.goBack();
  }

  async userGoForward(): Promise<void> {
    this.recordHumanInput();
    const browser = await this.waitForBrowser();
    if (browser.navigationHistory.canGoForward()) browser.navigationHistory.goForward();
  }

  async userReload(): Promise<void> {
    this.recordHumanInput();
    const browser = await this.waitForBrowser();
    browser.reload();
  }

  openDownload(download: ElectronBrowserDownload): void {
    this.downloads.openDownload(download);
  }

  private async executeWithBrowser(
    command: ElectronBrowserCommand,
  ): Promise<ElectronBrowserCommandResultValue> {
    const browser = await this.waitForBrowser();
    return executeBrowserCommand(
      {
        browser,
        store: this.store,
        refResolver: this.refResolver,
        getBrowser: () => this.waitForBrowser(),
        getState: () => this.getState(),
        getDialogState: () => this.dialogState,
        handleDialog: (action, promptText) => this.handleDialog(action, promptText),
        snapshot: (snapshotBrowser) => this.snapshot(snapshotBrowser),
      },
      command,
    );
  }

  private async handleDialog(action: 'accept' | 'dismiss', promptText?: string): Promise<string> {
    const state = this.dialogState;
    this.dialogState = { open: false };

    if (!state.type) return 'No dialog or popup is pending.';

    if (state.type === 'popup' && state.url && state.disposition === 'pending') {
      if (action === 'accept') {
        const browser = await this.waitForBrowser();
        await browser.loadURL(normalizeUrl(state.url));
        return `Accepted popup and opened ${browser.getURL()}`;
      }
      return `Dismissed popup: ${state.url}`;
    }

    if (state.type === 'prompt' && action === 'accept') {
      return `Recorded prompt response: ${promptText ?? state.defaultPromptText ?? ''}`;
    }

    return `${action === 'accept' ? 'Accepted' : 'Dismissed'} ${state.type} dialog.`;
  }

  private async snapshot(browser: WebContents): Promise<string> {
    const readSnapshot = async () =>
      (await browser.executeJavaScript(
        buildSnapshotScript(this.store.getSnapshotIdentities()),
        true,
      )) as {
        tree: string;
        refs: Record<string, RefEntry>;
        identities: string[];
        viewport: { width: number; height: number; deviceScaleFactor: number };
        scroll: {
          pagesAbove: number;
          pagesBelow: number;
          scrollTop: number;
          scrollLeft: number;
          scrollHeight: number;
          scrollWidth: number;
        };
      };

    let result = await readSnapshot();
    if (!result.tree.trim()) {
      await waitForNonEmptyHttpPage(browser, async () => {
        const probe = await readSnapshot();
        return !probe.tree.trim();
      });
      result = await readSnapshot();
    }

    this.refResolver.setRefs(result.refs);
    this.store.setSnapshotIdentities(result.identities);
    const tabs = this.getState()
      .tabs.map(
        (tab) => `  ${tab.active ? '*' : ' '} ${tab.id}: ${tab.title || '(untitled)'} - ${tab.url}`,
      )
      .join('\n');
    return `URL: ${browser.getURL()}\nTitle: ${browser.getTitle()}\nViewport: ${result.viewport.width}x${result.viewport.height} @ ${result.viewport.deviceScaleFactor}x\nTabs:\n${tabs}\nScroll: ${result.scroll.pagesAbove} page(s) above, ${result.scroll.pagesBelow} page(s) below (${result.scroll.scrollLeft},${result.scroll.scrollTop} of ${result.scroll.scrollWidth}x${result.scroll.scrollHeight})\n\n${result.tree || '(empty page)'}`;
  }

  private async waitForBrowser(): Promise<WebContents> {
    const deadline = Date.now() + BROWSER_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.browser && !this.browser.isDestroyed()) return this.browser;
      await new Promise((resolve) => setTimeout(resolve, BROWSER_READY_POLL_MS));
    }
    throw new Error(
      'Browser panel did not become ready in time. Please ensure the browser panel is open and try again.',
    );
  }

  private updateTabFromContents(): void {
    if (!this.browser) return;
    this.store.updateActiveTab(this.browser.getTitle(), this.browser.getURL());
  }

  private injectBrowserScripts(contents: WebContents): void {
    if (contents.isDestroyed()) return;
    const currentUrl = contents.getURL();
    if (!currentUrl || currentUrl === DEFAULT_URL || currentUrl.startsWith('devtools://')) return;
    void contents.executeJavaScript(DIALOG_INTERCEPT_SCRIPT, true).catch(() => {});
    void contents.executeJavaScript(WEBAUTHN_INTERCEPT_SCRIPT, true).catch(() => {});
  }

  private recordDialogMessage(payload: string): void {
    try {
      const parsed = JSON.parse(payload) as ElectronBrowserDialogState;
      this.dialogState = {
        open: true,
        type: parsed.type,
        message: parsed.message,
        defaultPromptText: parsed.defaultPromptText,
        url: parsed.url,
        disposition: 'auto-dismissed',
      };
    } catch {
      this.dialogState = {
        open: true,
        type: 'alert',
        message: payload,
        disposition: 'auto-dismissed',
      };
    }
  }

  private broadcastState(): void {
    this.windowGetter()?.webContents.send('browser:state-changed', this.getState());
  }

  private async handleBridgeCommand(
    sessionId: string,
    command: ElectronBrowserCommand,
  ): Promise<ElectronBrowserCommandResultValue> {
    if (sessionId !== this.store.getCurrentSessionId()) {
      this.switchSession(sessionId);
    }
    return this.execute(command);
  }
}
