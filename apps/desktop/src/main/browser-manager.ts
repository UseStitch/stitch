import { app, shell, webContents, type BrowserWindow, type WebContents } from 'electron';
import { mkdirSync } from 'node:fs';
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
const DEFAULT_SCROLL_PX = 650;

type RefEntry = { selector: string; role: string; name: string };

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
      refs[ref] = { selector: cssPath(el), role: r, name: label };
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
  private activeTabId: string | null = null;
  private tabs = new Map<string, { id: string; title: string; url: string }>();
  private refs = new Map<string, RefEntry>();
  private downloads = new Map<string, ElectronBrowserDownload>();
  private controller: ElectronBrowserState['controller'] = 'none';
  private controlEpoch = 0;
  private humanIdleTimer: NodeJS.Timeout | null = null;
  private wss: WebSocketServer | null = null;

  constructor(windowGetter: () => BrowserWindow | null) {
    this.windowGetter = windowGetter;
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

  registerWebview(webContentsId: number): ElectronBrowserState {
    const contents = webContents.fromId(webContentsId);
    if (!contents) throw new Error(`Browser webview ${webContentsId} was not found`);

    // Same webview re-registering (panel remount) — skip duplicate setup
    if (
      this.registeredWebContentsId === webContentsId &&
      this.browser &&
      !this.browser.isDestroyed()
    ) {
      return this.getState();
    }

    // New webview element — reattach without clearing existing tabs
    this.browser = contents;
    this.registeredWebContentsId = webContentsId;

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
        return `Navigated to ${browser.getURL()}`;
      case 'search':
        await browser.loadURL(searchUrl(command.query, command.engine));
        return `Searched for ${command.query}`;
      case 'goBack':
        if (browser.navigationHistory.canGoBack()) browser.navigationHistory.goBack();
        return `Went back to ${browser.getURL()}`;
      case 'goForward':
        if (browser.navigationHistory.canGoForward()) browser.navigationHistory.goForward();
        return `Went forward to ${browser.getURL()}`;
      case 'newTab': {
        const newTabId = `tab-${Date.now()}`;
        const newUrl = normalizeUrl(command.url ?? DEFAULT_URL);
        this.tabs.set(newTabId, { id: newTabId, title: '', url: newUrl });
        this.activeTabId = newTabId;
        this.broadcastState();
        await browser.loadURL(newUrl);
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
          } else {
            // No tabs left — create a fresh one
            const freshId = `tab-${Date.now()}`;
            this.tabs.set(freshId, { id: freshId, title: '', url: DEFAULT_URL });
            this.activeTabId = freshId;
            this.broadcastState();
            await browser.loadURL(DEFAULT_URL);
          }
        }
        this.broadcastState();
        return this.getState();
      }
      case 'snapshot':
        return this.snapshot(browser);
      case 'click':
        await this.runOnRef(
          command.ref,
          (selector) => `document.querySelector(${JSON.stringify(selector)})?.click()`,
        );
        return `Clicked ${command.ref}`;
      case 'hover':
        await this.runOnRef(
          command.ref,
          (selector) =>
            `document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`,
        );
        return `Hovered ${command.ref}`;
      case 'type':
        await this.typeIntoRef(command.ref, command.text, command.clear, command.submit);
        return `Typed into ${command.ref}`;
      case 'press':
        browser.sendInputEvent({ type: 'keyDown', keyCode: command.key });
        browser.sendInputEvent({ type: 'keyUp', keyCode: command.key });
        return `Pressed ${command.key}`;
      case 'select':
        await this.runOnRef(
          command.ref,
          (selector) =>
            `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return; for (const option of el.options || []) option.selected = ${JSON.stringify(command.values)}.includes(option.value) || ${JSON.stringify(command.values)}.includes(option.textContent?.trim()); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`,
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

  private async runOnRef(ref: string, buildScript: (selector: string) => string): Promise<unknown> {
    const entry = this.refs.get(ref);
    if (!entry) throw new Error(`Unknown ref: ${ref}. Take a fresh browser_snapshot first.`);
    return (await this.waitForBrowser()).executeJavaScript(buildScript(entry.selector), true);
  }

  private async typeIntoRef(
    ref: string,
    text: string,
    clear?: boolean,
    submit?: boolean,
  ): Promise<void> {
    await this.runOnRef(
      ref,
      (selector) =>
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return; el.focus(); ${clear ? 'el.value = "";' : ''} el.value = (el.value || '') + ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); ${submit ? "el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));" : ''} })()`,
    );
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
        (selector) =>
          `document.querySelector(${JSON.stringify(selector)})?.scrollBy(${direction === 'left' || direction === 'right' ? delta : 0}, ${direction === 'up' || direction === 'down' ? delta : 0})`,
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

  private updateTabFromContents(): void {
    if (!this.browser || !this.activeTabId) return;
    this.tabs.set(this.activeTabId, {
      id: this.activeTabId,
      title: this.browser.getTitle(),
      url: this.browser.getURL(),
    });
    this.broadcastState();
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

  private async handleSocketMessage(socket: WebSocket, raw: string): Promise<void> {
    const message = JSON.parse(raw) as ElectronBrowserCommandMessage;
    if (message.type !== 'browser:command') return;
    try {
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
