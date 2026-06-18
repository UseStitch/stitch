import { app, shell, webContents, type BrowserWindow, type WebContents } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

import type {
  ElectronBrowserCommand,
  ElectronBrowserCommandMessage,
  ElectronBrowserDownload,
  ElectronBrowserState,
} from '@stitch/shared/browser/electron';

const HOST = '127.0.0.1';
const DEFAULT_URL = 'about:blank';
const HUMAN_CONTROL_IDLE_MS = 750;
const LOAD_TIMEOUT_MS = 15_000;
const BROWSER_READY_TIMEOUT_MS = 20_000;
const BROWSER_READY_POLL_MS = 50;
const PAGE_STABILITY_IDLE_MS = 500;
const DEFAULT_SCROLL_PX = 650;

/** Domains whose popups are auth-related and should open in the system browser. */
const AUTH_POPUP_DOMAINS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
  'github.com/login',
  'github.com/sessions',
  'auth0.com',
  'okta.com',
  'login.yahoo.com',
  'id.atlassian.com',
];

/**
 * Script injected into the webview to detect WebAuthn/passkey calls.
 * When navigator.credentials.create/get is called with publicKey options,
 * we notify the main process via a console message so it can open the page
 * in the system browser.
 */
const WEBAUTHN_INTERCEPT_SCRIPT = `
  if (window.__stitchWebAuthnPatched) { /* already patched */ } else {
    window.__stitchWebAuthnPatched = true;
    const origCreate = navigator.credentials?.create?.bind(navigator.credentials);
    const origGet = navigator.credentials?.get?.bind(navigator.credentials);

    function notifyMainProcess() {
      console.log('__stitch_webauthn_request__' + location.href);
    }

    function patchedCreate(options) {
      if (options?.publicKey) {
        notifyMainProcess();
        return Promise.reject(new DOMException(
          'Passkeys are not supported in this browser. The page has been opened in your system browser.',
          'NotAllowedError'
        ));
      }
      return origCreate?.(options) ?? Promise.reject(new DOMException('Not supported', 'NotSupportedError'));
    }

    function patchedGet(options) {
      if (options?.publicKey) {
        notifyMainProcess();
        return Promise.reject(new DOMException(
          'Passkeys are not supported in this browser. The page has been opened in your system browser.',
          'NotAllowedError'
        ));
      }
      return origGet?.(options) ?? Promise.reject(new DOMException('Not supported', 'NotSupportedError'));
    }

    if (navigator.credentials) {
      Object.defineProperty(navigator.credentials, 'create', { value: patchedCreate, writable: false, configurable: true });
      Object.defineProperty(navigator.credentials, 'get', { value: patchedGet, writable: false, configurable: true });
    }
  }
`;

function isAuthPopupUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const fullHost = parsed.hostname + parsed.pathname;
    return AUTH_POPUP_DOMAINS.some(
      (domain) =>
        parsed.hostname === domain ||
        parsed.hostname.endsWith('.' + domain) ||
        fullHost.startsWith(domain),
    );
  } catch {
    return false;
  }
}

type RefEntry = {
  selector: string;
  tag: string;
  role: string;
  name: string;
  x: number;
  y: number;
};
type TabInfo = { id: string; title: string; url: string };
type SessionTabState = { tabs: TabInfo[]; activeTabId: string | null };
type PersistedBrowserState = { sessions: Record<string, SessionTabState> };

function getStatePath(): string {
  return join(app.getPath('home'), '.stitch', 'browser-state.json');
}

function loadPersistedState(): PersistedBrowserState {
  try {
    const raw = readFileSync(getStatePath(), 'utf8');
    return JSON.parse(raw) as PersistedBrowserState;
  } catch {
    return { sessions: {} };
  }
}

function savePersistedState(state: PersistedBrowserState): void {
  const dir = join(app.getPath('home'), '.stitch');
  mkdirSync(dir, { recursive: true });
  writeFileSync(getStatePath(), JSON.stringify(state, null, 2), 'utf8');
}

const SNAPSHOT_SCRIPT = String.raw`
(() => {
  let refCounter = 0;
  const refs = {};
  const lines = [];
  const maxNodes = 3000;
  let count = 0;

  function cssPath(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (!parent) break;
      const siblings = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
      const index = siblings.indexOf(node) + 1;
      parts.unshift(tag + ':nth-of-type(' + index + ')');
      node = parent;
    }
    return parts.length ? parts.join(' > ') : 'body';
  }

  function visible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function role(el) {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'input') return ['checkbox', 'radio', 'button', 'submit'].includes(el.type) ? el.type : 'textbox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'img') return 'img';
    return 'generic';
  }

  function name(el) {
    return el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.innerText?.trim().replace(/\s+/g, ' ').slice(0, 100) || '';
  }

  function interactable(el) {
    const tag = el.tagName.toLowerCase();
    const r = role(el);
    return ['a', 'button', 'input', 'textarea', 'select', 'summary'].includes(tag) || ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio'].includes(r) || el.hasAttribute('onclick') || el.hasAttribute('tabindex') || getComputedStyle(el).cursor === 'pointer';
  }

  function walk(el, depth) {
    if (!el || count > maxNodes || el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'template', 'meta', 'link', 'head', 'svg'].includes(tag)) return;
    if (!visible(el) && tag !== 'body' && tag !== 'html') return;

    count++;
    const r = role(el);
    const label = name(el);
    const isTarget = interactable(el);
    let ref = null;
    if (isTarget) {
      refCounter++;
      ref = 'e' + refCounter;
      const rect = el.getBoundingClientRect();
      refs[ref] = {
        selector: cssPath(el),
        tag,
        role: r,
        name: label,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
    if (isTarget || label || r !== 'generic') {
      const attrs = [];
      if (ref) attrs.push('ref=' + ref);
      if (el.disabled) attrs.push('disabled');
      const suffix = attrs.length ? ' [' + attrs.join(' ') + ']' : '';
      lines.push('  '.repeat(depth) + '- ' + r + (label ? ' ' + JSON.stringify(label) : '') + suffix);
    }
    for (const child of Array.from(el.children)) walk(child, depth + 1);
  }

  walk(document.body || document.documentElement, 0);
  return {
    url: location.href,
    title: document.title,
    tree: lines.join('\n'),
    refs,
    scroll: {
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      pagesAbove: Math.floor(window.scrollY / Math.max(window.innerHeight, 1)),
      pagesBelow: Math.ceil((document.documentElement.scrollHeight - window.scrollY - window.innerHeight) / Math.max(window.innerHeight, 1)),
    },
  };
})()
`;

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_URL;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function searchUrl(query: string, engine = 'google'): string {
  const encoded = encodeURIComponent(query);
  if (engine === 'duckduckgo') return `https://duckduckgo.com/?q=${encoded}`;
  if (engine === 'bing') return `https://www.bing.com/search?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

function rawSocketDataToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return Buffer.concat(data).toString('utf8');
}

export class ElectronBrowserManager {
  private windowGetter: () => BrowserWindow | null;
  private browser: WebContents | null = null;
  private registeredWebContentsId: number | null = null;
  private currentSessionId: string | null = null;
  private activeTabId: string | null = null;
  private tabs = new Map<string, TabInfo>();
  private sessionTabs = new Map<string, SessionTabState>();
  private refs = new Map<string, RefEntry>();
  private downloads = new Map<string, ElectronBrowserDownload>();
  private controller: ElectronBrowserState['controller'] = 'none';
  private controlEpoch = 0;
  private humanIdleTimer: NodeJS.Timeout | null = null;
  private wss: WebSocketServer | null = null;

  constructor(windowGetter: () => BrowserWindow | null) {
    this.windowGetter = windowGetter;
    this.loadFromDisk();
  }

  startBridge(port: number): void {
    this.wss = new WebSocketServer({ host: HOST, port });
    this.wss.on('connection', (socket) => {
      socket.on(
        'message',
        (data) => void this.handleSocketMessage(socket, rawSocketDataToString(data)),
      );
    });
  }

  stopBridge(): void {
    this.wss?.close();
    this.wss = null;
  }

  switchSession(sessionId: string): ElectronBrowserState {
    if (sessionId === this.currentSessionId) return this.getState();
    this.saveCurrentSessionToMemory();
    this.loadSessionTabs(sessionId);
    if (this.browser && !this.browser.isDestroyed() && this.activeTabId) {
      const activeTab = this.tabs.get(this.activeTabId);
      if (activeTab?.url && activeTab.url !== 'about:blank') {
        void this.browser.loadURL(activeTab.url);
      }
    }
    this.persistToDisk();
    this.broadcastState();
    return this.getState();
  }

  persistToDisk(): void {
    this.saveCurrentSessionToMemory();
    const persisted: PersistedBrowserState = { sessions: {} };
    for (const [id, state] of this.sessionTabs) {
      persisted.sessions[id] = state;
    }
    savePersistedState(persisted);
  }

  registerWebview(webContentsId: number, sessionId: string): ElectronBrowserState {
    const contents = webContents.fromId(webContentsId);
    if (!contents) throw new Error(`Browser webview ${webContentsId} was not found`);

    // Same webview re-registering (panel remount) — skip duplicate setup
    if (
      this.registeredWebContentsId === webContentsId &&
      this.browser &&
      !this.browser.isDestroyed()
    ) {
      // Session may have changed even if webview is the same
      if (sessionId !== this.currentSessionId) {
        this.switchSession(sessionId);
      }
      return this.getState();
    }

    // New webview element — reattach
    this.browser = contents;
    this.registeredWebContentsId = webContentsId;

    // Switch to requested session (restores tabs from memory/disk)
    this.loadSessionTabs(sessionId);

    if (this.tabs.size > 0 && this.activeTabId) {
      // Restore active tab by navigating the new webview to its URL
      const activeTab = this.tabs.get(this.activeTabId);
      if (activeTab?.url && activeTab.url !== 'about:blank') {
        void contents.loadURL(activeTab.url);
      }
    } else {
      // First time — create a fresh tab
      const tabId = `tab-${Date.now()}`;
      this.activeTabId = tabId;
      this.tabs.set(tabId, { id: tabId, title: '', url: contents.getURL() });
    }

    contents.on('did-navigate', () => this.updateTabFromContents());
    contents.on('did-navigate-in-page', () => this.updateTabFromContents());
    contents.on('page-title-updated', () => this.updateTabFromContents());
    contents.on('render-process-gone', () => this.broadcastState());
    contents.session.on('will-download', (_event, item) => this.handleDownload(item));

    // Open auth-related popups in the system browser (passkey/OAuth flows)
    contents.setWindowOpenHandler(({ url }) => {
      if (isAuthPopupUrl(url)) {
        void shell.openExternal(url);
        return { action: 'deny' };
      }
      // Non-auth popups: navigate the webview itself
      void contents.loadURL(url);
      return { action: 'deny' };
    });

    // Inject WebAuthn intercept script on every page load
    contents.on('did-finish-load', () => this.injectWebAuthnIntercept(contents));

    // Listen for WebAuthn detection signal from the injected script
    const WEBAUTHN_SIGNAL = '__stitch_webauthn_request__';
    contents.on('console-message', (_event, _level, message) => {
      if (message.startsWith(WEBAUTHN_SIGNAL)) {
        const url = message.slice(WEBAUTHN_SIGNAL.length);
        void shell.openExternal(url || contents.getURL());
      }
    });

    this.broadcastState();
    return this.getState();
  }

  getState(): ElectronBrowserState {
    return {
      tabs: Array.from(this.tabs.values()).map((tab) => ({
        ...tab,
        type: 'page',
        active: tab.id === this.activeTabId,
      })),
      activeTabId: this.activeTabId,
      visible: true,
      controller: this.controller,
      downloads: Array.from(this.downloads.values()).sort((a, b) => b.createdAt - a.createdAt),
    };
  }

  requestShow(): ElectronBrowserState {
    this.windowGetter()?.webContents.send('browser:show-requested');
    return this.getState();
  }

  recordHumanInput(): void {
    this.controlEpoch++;
    this.controller = 'human';
    if (this.humanIdleTimer) clearTimeout(this.humanIdleTimer);
    this.humanIdleTimer = setTimeout(() => {
      if (this.controller === 'human') {
        this.controller = 'none';
        this.broadcastState();
      }
    }, HUMAN_CONTROL_IDLE_MS);
    this.broadcastState();
  }

  async execute(command: ElectronBrowserCommand): Promise<unknown> {
    if (command.action === 'state') return this.getState();
    if (command.action === 'ensure') return this.requestShow();
    this.requestShow();
    return this.withAgentControl(() => this.executeWithBrowser(command));
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

  private async executeWithBrowser(command: ElectronBrowserCommand): Promise<unknown> {
    const browser = await this.waitForBrowser();
    switch (command.action) {
      case 'navigate':
        await browser.loadURL(normalizeUrl(command.url));
        await this.waitForPageStability(browser, command.timeoutMs);
        return `Navigated to ${browser.getURL()}`;
      case 'search':
        await browser.loadURL(searchUrl(command.query, command.engine));
        await this.waitForPageStability(browser, command.timeoutMs);
        return `Searched for ${command.query}`;
      case 'goBack':
        if (browser.navigationHistory.canGoBack()) browser.navigationHistory.goBack();
        await this.waitForPageStability(browser, command.timeoutMs);
        return `Went back to ${browser.getURL()}`;
      case 'goForward':
        if (browser.navigationHistory.canGoForward()) browser.navigationHistory.goForward();
        await this.waitForPageStability(browser, command.timeoutMs);
        return `Went forward to ${browser.getURL()}`;
      case 'newTab': {
        const newTabId = `tab-${Date.now()}`;
        const newUrl = normalizeUrl(command.url ?? DEFAULT_URL);
        this.tabs.set(newTabId, { id: newTabId, title: '', url: newUrl });
        this.activeTabId = newTabId;
        this.broadcastState();
        await browser.loadURL(newUrl);
        await this.waitForPageStability(browser, command.timeoutMs);
        this.debouncedPersist();
        return this.getState();
      }
      case 'listTabs':
        return this.getState().tabs;
      case 'focusTab': {
        const target = this.tabs.get(command.tabId);
        if (!target) return this.getState();
        this.activeTabId = command.tabId;
        this.broadcastState();
        await browser.loadURL(normalizeUrl(target.url) || DEFAULT_URL);
        await this.waitForPageStability(browser, command.timeoutMs);
        return this.getState();
      }
      case 'closeTab': {
        const tabId = command.tabId ?? this.activeTabId;
        if (!tabId || !this.tabs.has(tabId)) return this.getState();
        this.tabs.delete(tabId);
        if (this.activeTabId === tabId) {
          const remaining = Array.from(this.tabs.keys());
          if (remaining.length > 0) {
            this.activeTabId = remaining[remaining.length - 1]!;
            const next = this.tabs.get(this.activeTabId)!;
            this.broadcastState();
            await browser.loadURL(normalizeUrl(next.url) || DEFAULT_URL);
            await this.waitForPageStability(browser);
          } else {
            // No tabs left — create a fresh one
            const freshId = `tab-${Date.now()}`;
            this.tabs.set(freshId, { id: freshId, title: '', url: DEFAULT_URL });
            this.activeTabId = freshId;
            this.broadcastState();
            await browser.loadURL(DEFAULT_URL);
            await this.waitForPageStability(browser);
          }
        }
        this.broadcastState();
        this.debouncedPersist();
        return this.getState();
      }
      case 'snapshot':
        return this.snapshot(browser);
      case 'click':
        await this.clickRef(browser, command.ref, command.doubleClick, command.button);
        await this.waitForPageStability(browser, command.timeoutMs);
        return `Clicked ${command.ref}`;
      case 'hover':
        await this.hoverRef(browser, command.ref);
        return `Hovered ${command.ref}`;
      case 'type':
        await this.typeIntoRef(
          browser,
          command.ref,
          command.text,
          command.clear,
          command.submit,
          command.slowly,
        );
        return `Typed into ${command.ref}`;
      case 'press':
        browser.sendInputEvent({ type: 'keyDown', keyCode: command.key });
        browser.sendInputEvent({ type: 'keyUp', keyCode: command.key });
        await this.waitForPageStability(browser, command.timeoutMs);
        return `Pressed ${command.key}`;
      case 'select':
        await this.runOnRef(
          command.ref,
          (element) =>
            `for (const option of ${element}.options || []) option.selected = ${JSON.stringify(command.values)}.includes(option.value) || ${JSON.stringify(command.values)}.includes(option.textContent?.trim()); ${element}.dispatchEvent(new Event('input', { bubbles: true })); ${element}.dispatchEvent(new Event('change', { bubbles: true })); return true;`,
        );
        return `Selected ${command.values.join(', ')} in ${command.ref}`;
      case 'scroll':
        await this.scroll(command.ref, command.direction);
        return `Scrolled ${command.direction}`;
      case 'resize':
        return `Resize requested: ${command.width}x${command.height}`;
      case 'screenshot': {
        const image = await browser.capturePage();
        const format = command.format ?? 'png';
        return {
          data:
            format === 'png'
              ? image.toPNG().toString('base64')
              : image.toJPEG(command.quality ?? 90).toString('base64'),
          format,
        };
      }
      case 'evaluate':
        return browser.executeJavaScript(command.expression, true);
      case 'wait':
        await this.wait(command.timeMs, command.selector, command.timeoutMs);
        return command.selector
          ? `Selector appeared: ${command.selector}`
          : `Waited ${command.timeMs ?? 0}ms`;
      case 'extractPageContent':
        return browser.executeJavaScript(
          `(() => (document.querySelector(${JSON.stringify(command.selector ?? 'body')})?.innerText || '').trim())()`,
          true,
        );
      case 'searchPage':
        return browser.executeJavaScript(this.searchPageScript(command), true);
      case 'findElements':
        return browser.executeJavaScript(this.findElementsScript(command), true);
      case 'dialogState':
        return { open: false };
      case 'handleDialog':
        return 'No dialog handling is required.';
    }
  }

  private async snapshot(browser: WebContents): Promise<string> {
    const result = (await browser.executeJavaScript(SNAPSHOT_SCRIPT, true)) as {
      tree: string;
      refs: Record<string, RefEntry>;
      scroll: { pagesAbove: number; pagesBelow: number };
    };
    this.refs = new Map(Object.entries(result.refs));
    const tabs = this.getState()
      .tabs.map(
        (tab) => `  ${tab.active ? '*' : ' '} ${tab.id}: ${tab.title || '(untitled)'} - ${tab.url}`,
      )
      .join('\n');
    return `URL: ${browser.getURL()}\nTitle: ${browser.getTitle()}\nTabs:\n${tabs}\nScroll: ${result.scroll.pagesAbove} page(s) above, ${result.scroll.pagesBelow} page(s) below\n\n${result.tree || '(empty page)'}`;
  }

  private async runOnRef(ref: string, buildScript: (element: string) => string): Promise<unknown> {
    const result = await (
      await this.waitForBrowser()
    ).executeJavaScript(
      this.refActionScript(ref, (element) => buildScript(element)),
      true,
    );
    return this.unwrapRefResult(ref, result);
  }

  private async resolveRef(ref: string): Promise<{ x: number; y: number }> {
    const result = await (
      await this.waitForBrowser()
    ).executeJavaScript(
      this.refActionScript(
        ref,
        (element) =>
          `${element}.scrollIntoView({ block: 'center', inline: 'center' }); ${element}.focus?.(); return true;`,
      ),
      true,
    );
    return this.unwrapRefResult(ref, result) as { x: number; y: number };
  }

  private async focusRef(ref: string, clear?: boolean): Promise<void> {
    const result = await (
      await this.waitForBrowser()
    ).executeJavaScript(
      this.refActionScript(
        ref,
        (element) => `
          ${element}.scrollIntoView({ block: 'center', inline: 'center' });
          ${element}.focus();
          if (${clear ? 'true' : 'false'} && 'value' in ${element}) {
            const valueSetter = Object.getOwnPropertyDescriptor(${element}.constructor.prototype, 'value')?.set;
            if (valueSetter) valueSetter.call(${element}, '');
            else ${element}.value = '';
            ${element}.dispatchEvent(new Event('input', { bubbles: true }));
            ${element}.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return true;
        `,
      ),
      true,
    );
    this.unwrapRefResult(ref, result);
  }

  private refActionScript(ref: string, buildScript: (element: string) => string): string {
    const entry = this.refs.get(ref);
    if (!entry) throw new Error(`Unknown ref: ${ref}. Take a fresh browser_snapshot first.`);
    return `(() => {
      const target = ${JSON.stringify(entry)};

      function visible(el) {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      }

      function role(el) {
        const explicit = el.getAttribute('role');
        if (explicit) return explicit;
        const tag = el.tagName.toLowerCase();
        if (tag === 'a' && el.hasAttribute('href')) return 'link';
        if (tag === 'button') return 'button';
        if (tag === 'input') return ['checkbox', 'radio', 'button', 'submit'].includes(el.type) ? el.type : 'textbox';
        if (tag === 'textarea') return 'textbox';
        if (tag === 'select') return 'combobox';
        if (/^h[1-6]$/.test(tag)) return 'heading';
        if (tag === 'img') return 'img';
        return 'generic';
      }

      function name(el) {
        return el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.innerText?.trim().replace(/\\s+/g, ' ').slice(0, 100) || '';
      }

      function matchesIdentity(el) {
        return el.tagName.toLowerCase() === target.tag && role(el) === target.role && name(el) === target.name && visible(el);
      }

      function distanceFromSnapshot(el) {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        return Math.hypot(x - target.x, y - target.y);
      }

      function resolveElement() {
        try {
          const current = document.querySelector(target.selector);
          if (current && matchesIdentity(current)) return current;
        } catch {}

        const candidates = Array.from(document.querySelectorAll(target.tag)).filter(matchesIdentity);
        candidates.sort((a, b) => distanceFromSnapshot(a) - distanceFromSnapshot(b));
        return candidates[0] || null;
      }

      const el = resolveElement();
      if (!el) return { ok: false, error: 'Element not found' };
      const actionResult = (() => { ${buildScript('el')} })();
      const rect = el.getBoundingClientRect();
      return {
        ok: true,
        result: actionResult,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };
    })()`;
  }

  private unwrapRefResult(ref: string, result: unknown): unknown {
    if (!result || typeof result !== 'object' || !('ok' in result)) {
      throw new Error(`Browser interaction on ${ref} did not return a valid result.`);
    }

    if (!(result as { ok: boolean }).ok) {
      const error = (result as { error?: string }).error ?? 'Element interaction failed';
      throw new Error(`${error}: ${ref}. Take a fresh browser_snapshot before retrying.`);
    }

    const success = result as unknown as { result: unknown; x?: unknown; y?: unknown };
    if (typeof success.x === 'number' && typeof success.y === 'number') {
      return { x: success.x, y: success.y };
    }
    return success.result;
  }

  private async clickRef(
    browser: WebContents,
    ref: string,
    doubleClick?: boolean,
    button: string = 'left',
  ): Promise<void> {
    const target = await this.resolveRef(ref);
    const mouseButton = button === 'right' || button === 'middle' ? button : 'left';
    browser.sendInputEvent({ type: 'mouseMove', x: target.x, y: target.y });
    browser.sendInputEvent({
      type: 'mouseDown',
      x: target.x,
      y: target.y,
      button: mouseButton,
      clickCount: 1,
    });
    browser.sendInputEvent({
      type: 'mouseUp',
      x: target.x,
      y: target.y,
      button: mouseButton,
      clickCount: 1,
    });
    if (doubleClick) {
      browser.sendInputEvent({
        type: 'mouseDown',
        x: target.x,
        y: target.y,
        button: mouseButton,
        clickCount: 2,
      });
      browser.sendInputEvent({
        type: 'mouseUp',
        x: target.x,
        y: target.y,
        button: mouseButton,
        clickCount: 2,
      });
    }
  }

  private async hoverRef(browser: WebContents, ref: string): Promise<void> {
    const target = await this.resolveRef(ref);
    browser.sendInputEvent({ type: 'mouseMove', x: target.x, y: target.y });
  }

  private async typeIntoRef(
    browser: WebContents,
    ref: string,
    text: string,
    clear?: boolean,
    submit?: boolean,
    slowly?: boolean,
  ): Promise<void> {
    await this.focusRef(ref, clear);
    if (slowly) {
      for (const char of text) {
        await browser.insertText(char);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } else {
      await browser.insertText(text);
    }
    if (submit) {
      browser.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      browser.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    }
  }

  private async scroll(
    ref: string | undefined,
    direction: 'up' | 'down' | 'left' | 'right',
  ): Promise<void> {
    const delta =
      direction === 'up' || direction === 'left' ? -DEFAULT_SCROLL_PX : DEFAULT_SCROLL_PX;
    if (ref) {
      await this.runOnRef(
        ref,
        (element) =>
          `${element}.scrollBy(${direction === 'left' || direction === 'right' ? delta : 0}, ${direction === 'up' || direction === 'down' ? delta : 0}); return true;`,
      );
      return;
    }
    await (
      await this.waitForBrowser()
    ).executeJavaScript(
      `window.scrollBy(${direction === 'left' || direction === 'right' ? delta : 0}, ${direction === 'up' || direction === 'down' ? delta : 0})`,
      true,
    );
  }

  private async wait(
    timeMs?: number,
    selector?: string,
    timeoutMs = LOAD_TIMEOUT_MS,
  ): Promise<void> {
    if (!selector) {
      await new Promise((resolve) => setTimeout(resolve, timeMs ?? 0));
      return;
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = await (
        await this.waitForBrowser()
      ).executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, true);
      if (found) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for selector: ${selector}`);
  }

  private searchPageScript(
    command: Extract<ElectronBrowserCommand, { action: 'searchPage' }>,
  ): string {
    return `(() => {
      const text = (document.querySelector(${JSON.stringify(command.cssScope ?? 'body')})?.innerText || '');
      const pattern = ${JSON.stringify(command.pattern)};
      const contextChars = ${command.contextChars ?? 80};
      const maxResults = ${command.maxResults ?? 20};
      const matches = [];
      if (${command.regex ? 'true' : 'false'}) {
        const re = new RegExp(pattern, ${JSON.stringify(command.caseSensitive ? 'g' : 'gi')});
        let match;
        while ((match = re.exec(text)) && matches.length < maxResults) {
          matches.push({ match: match[0], index: match.index, context: text.slice(Math.max(0, match.index - contextChars), match.index + match[0].length + contextChars) });
          if (match[0] === '') re.lastIndex++;
        }
        return { matches, total: matches.length };
      }
      const haystack = ${command.caseSensitive ? 'text' : 'text.toLowerCase()'};
      const needle = ${command.caseSensitive ? 'pattern' : 'pattern.toLowerCase()'};
      let index = haystack.indexOf(needle);
      while (index !== -1 && matches.length < maxResults) {
        matches.push({ match: text.slice(index, index + pattern.length), index, context: text.slice(Math.max(0, index - contextChars), index + pattern.length + contextChars) });
        index = haystack.indexOf(needle, index + Math.max(pattern.length, 1));
      }
      return { matches, total: matches.length };
    })()`;
  }

  private findElementsScript(
    command: Extract<ElectronBrowserCommand, { action: 'findElements' }>,
  ): string {
    return `(() => { const nodes = Array.from(document.querySelectorAll(${JSON.stringify(command.selector)})); const attrs = ${JSON.stringify(command.attributes ?? [])}; const includeText = ${command.includeText !== false}; const elements = nodes.slice(0, ${command.maxResults ?? 20}).map((el) => ({ tag: el.tagName.toLowerCase(), text: includeText ? (el.innerText || el.textContent || '').trim().slice(0, 200) : undefined, attributes: Object.fromEntries(attrs.map((name) => [name, el.getAttribute(name) || '']).filter(([, value]) => value)) })); return { elements, total: nodes.length }; })()`;
  }

  private async withAgentControl<T>(fn: () => Promise<T>): Promise<T> {
    const epoch = this.controlEpoch;
    this.controller = 'agent';
    this.broadcastState();
    const result = await fn();
    if (this.controlEpoch !== epoch)
      throw new Error(
        'Browser control interrupted by user input. Take a fresh snapshot before continuing.',
      );
    this.controller = 'none';
    this.broadcastState();
    return result;
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

  private async waitForPageStability(
    browser: WebContents,
    timeoutMs = LOAD_TIMEOUT_MS,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    await this.waitForLoadIdle(browser, deadline);
    await this.waitForDomIdle(browser, deadline);
  }

  private async waitForLoadIdle(browser: WebContents, deadline: number): Promise<void> {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error('Timed out waiting for page stability.');

    await new Promise<void>((resolve, reject) => {
      let idleTimer: NodeJS.Timeout | null = null;
      const timeoutTimer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for page stability.'));
      }, remainingMs);

      const cleanup = () => {
        if (idleTimer) clearTimeout(idleTimer);
        clearTimeout(timeoutTimer);
        browser.off('did-start-loading', onStartLoading);
        browser.off('did-stop-loading', onStopLoading);
        browser.off('did-fail-load', onStopLoading);
      };

      const finishAfterIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          cleanup();
          resolve();
        }, PAGE_STABILITY_IDLE_MS);
      };

      const onStopLoading = () => finishAfterIdle();

      const onStartLoading = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (!browser.isLoading()) finishAfterIdle();
      };

      browser.on('did-start-loading', onStartLoading);
      browser.on('did-stop-loading', onStopLoading);
      browser.on('did-fail-load', onStopLoading);

      if (browser.isLoading()) return;
      finishAfterIdle();
    });
  }

  private async waitForDomIdle(browser: WebContents, deadline: number): Promise<void> {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error('Timed out waiting for page stability.');

    const script = `new Promise((resolve) => {
      let idleTimer = null;
      const timeoutTimer = setTimeout(finish, ${remainingMs});
      const observer = new MutationObserver(reset);

      function finish() {
        if (idleTimer) clearTimeout(idleTimer);
        clearTimeout(timeoutTimer);
        observer.disconnect();
        resolve(true);
      }

      function reset() {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(finish, ${PAGE_STABILITY_IDLE_MS});
      }

      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      });
      reset();
    })`;

    await browser.executeJavaScript(script, true);
  }

  private updateTabFromContents(): void {
    if (!this.browser || !this.activeTabId) return;
    this.tabs.set(this.activeTabId, {
      id: this.activeTabId,
      title: this.browser.getTitle(),
      url: this.browser.getURL(),
    });
    this.broadcastState();
    this.debouncedPersist();
  }

  private injectWebAuthnIntercept(contents: WebContents): void {
    if (contents.isDestroyed()) return;
    const currentUrl = contents.getURL();
    if (!currentUrl || currentUrl === 'about:blank' || currentUrl.startsWith('devtools://')) return;
    void contents.executeJavaScript(WEBAUTHN_INTERCEPT_SCRIPT, true).catch(() => {});
  }

  private persistTimer: NodeJS.Timeout | null = null;
  private debouncedPersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistToDisk(), 2000);
  }

  private handleDownload(item: Electron.DownloadItem): void {
    const downloadsDir = join(app.getPath('home'), '.stitch', 'downloads');
    mkdirSync(downloadsDir, { recursive: true });
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const targetPath = join(downloadsDir, basename(item.getFilename()));
    item.setSavePath(targetPath);
    const update = (state: ElectronBrowserDownload['state']) => {
      this.downloads.set(id, {
        id,
        filename: item.getFilename(),
        path: targetPath,
        url: item.getURL(),
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state,
        createdAt: Date.now(),
      });
      this.broadcastState();
    };
    update('progressing');
    item.on('updated', (_event, state) =>
      update(state === 'interrupted' ? 'interrupted' : 'progressing'),
    );
    item.once('done', (_event, state) => update(state));
  }

  private broadcastState(): void {
    this.windowGetter()?.webContents.send('browser:state-changed', this.getState());
  }

  private saveCurrentSessionToMemory(): void {
    if (!this.currentSessionId) return;
    this.sessionTabs.set(this.currentSessionId, {
      tabs: Array.from(this.tabs.values()),
      activeTabId: this.activeTabId,
    });
  }

  private loadSessionTabs(sessionId: string): void {
    this.saveCurrentSessionToMemory();
    this.currentSessionId = sessionId;
    const stored = this.sessionTabs.get(sessionId);
    this.tabs.clear();
    if (stored && stored.tabs.length > 0) {
      for (const tab of stored.tabs) {
        this.tabs.set(tab.id, tab);
      }
      this.activeTabId = stored.activeTabId;
    } else {
      this.activeTabId = null;
    }
  }

  private loadFromDisk(): void {
    const persisted = loadPersistedState();
    for (const [id, state] of Object.entries(persisted.sessions)) {
      this.sessionTabs.set(id, state);
    }
  }

  private async handleSocketMessage(socket: WebSocket, raw: string): Promise<void> {
    const message = JSON.parse(raw) as ElectronBrowserCommandMessage;
    if (message.type !== 'browser:command') return;
    try {
      // Switch to the requesting session's tab state before executing
      if (message.sessionId !== this.currentSessionId) {
        this.switchSession(message.sessionId);
      }
      const result = await this.execute(message.command);
      socket.send(JSON.stringify({ id: message.id, type: 'browser:result', ok: true, result }));
    } catch (error) {
      socket.send(
        JSON.stringify({
          id: message.id,
          type: 'browser:result',
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  openDownload(download: ElectronBrowserDownload): void {
    void shell.openPath(download.path);
  }
}
