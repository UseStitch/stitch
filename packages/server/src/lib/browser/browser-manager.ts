import type { ChildProcess } from 'node:child_process';

import { CDPClient } from '@/lib/browser/cdp-client.js';
import { killChrome, launchChrome } from '@/lib/browser/chrome-launcher.js';
import type {
  BrowserTab,
  LaunchOptions,
  RefEntry,
  ScreenshotResult,
  ScrollDirection,
} from '@/lib/browser/types.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'browser.manager' });

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const SETTLE_MS = 500;
const LOAD_TIMEOUT_MS = 10_000;

type NavigationEntry = {
  id: number;
  url: string;
  title: string;
};

// ── Injected snapshot script ────────────────────────────────
// Runs inside the browser to build a YAML-like accessibility tree with refs.
// Assigns "eN" refs to interactable/visible elements and stores backendNodeId
// so we can resolve refs later via CDP DOM commands.

const SNAPSHOT_SCRIPT = `
(() => {
  let refCounter = window.__stitch_ref_counter || 0;
  const refMap = {};

  function getRole(el) {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    const roleMap = {
      a: el.hasAttribute('href') ? 'link' : 'generic',
      button: 'button', input: getInputRole(el), select: 'combobox',
      textarea: 'textbox', img: 'img', h1: 'heading', h2: 'heading',
      h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
      ul: 'list', ol: 'list', li: 'listitem', table: 'table',
      tr: 'row', td: 'cell', th: 'columnheader', nav: 'navigation',
      main: 'main', header: 'banner', footer: 'contentinfo',
      aside: 'complementary', form: 'form', dialog: 'dialog',
      article: 'article', section: 'region', details: 'group',
      summary: 'button', label: 'generic', option: 'option',
    };
    return roleMap[tag] || 'generic';
  }

  function getInputRole(el) {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const map = {
      checkbox: 'checkbox', radio: 'radio', button: 'button',
      submit: 'button', reset: 'button', range: 'slider',
      number: 'spinbutton', search: 'searchbox',
    };
    return map[type] || 'textbox';
  }

  function getName(el) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const label = document.getElementById(labelledBy);
      if (label) return label.textContent?.trim() || '';
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      const id = el.getAttribute('id');
      if (id) {
        const label = document.querySelector('label[for="' + id + '"]');
        if (label) return label.textContent?.trim() || '';
      }
      return el.getAttribute('placeholder') || el.getAttribute('title') || '';
    }
    if (el.tagName === 'IMG') return el.getAttribute('alt') || '';
    if (el.tagName === 'A') return el.textContent?.trim() || '';
    return '';
  }

  function isVisible(el) {
    if (el.offsetParent === null && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isInteractable(el) {
    const tag = el.tagName.toLowerCase();
    if (['a', 'button', 'input', 'textarea', 'select', 'summary', 'option'].includes(tag)) return true;
    if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link'
        || el.getAttribute('role') === 'tab' || el.getAttribute('role') === 'menuitem'
        || el.getAttribute('role') === 'checkbox' || el.getAttribute('role') === 'radio') return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return true;
    const style = getComputedStyle(el);
    if (style.cursor === 'pointer') return true;
    return false;
  }

  function getValue(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value || '';
    if (el.tagName === 'SELECT') {
      const selected = Array.from(el.selectedOptions).map(o => o.textContent?.trim()).filter(Boolean);
      return selected.join(', ');
    }
    return '';
  }

  function getAttributes(el, role) {
    const attrs = [];
    if (el.getAttribute('aria-checked') === 'true' || el.checked) attrs.push('checked');
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') attrs.push('disabled');
    if (el.getAttribute('aria-expanded') === 'true') attrs.push('expanded');
    if (el.getAttribute('aria-selected') === 'true' || el.selected) attrs.push('selected');
    if (role === 'heading') {
      const tag = el.tagName.toLowerCase();
      const level = tag.match(/^h(\\d)$/);
      if (level) attrs.push('level=' + level[1]);
    }
    const href = el.getAttribute('href');
    if (href && role === 'link') attrs.push('url=' + href);
    return attrs;
  }

  function walk(el, depth) {
    if (!el || el.nodeType !== 1) return [];
    if (el.getAttribute('aria-hidden') === 'true') return [];
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'template', 'meta', 'link', 'head'].includes(tag)) return [];
    if (!isVisible(el)) return [];

    const role = getRole(el);
    const name = getName(el);
    const value = getValue(el);
    const attrs = getAttributes(el, role);
    const lines = [];

    const shouldShow = role !== 'generic' || name;
    const assignRef = shouldShow && isInteractable(el);

    let ref = null;
    if (assignRef) {
      refCounter++;
      ref = 'e' + refCounter;
      refMap[ref] = { backendNodeId: null, role, name };
      el.setAttribute('data-stitch-ref', ref);
    }

    if (shouldShow) {
      const indent = '  '.repeat(depth);
      let line = indent + '- ' + role;
      if (name) line += ' ' + JSON.stringify(name);
      for (const attr of attrs) line += ' [' + attr + ']';
      if (ref) line += ' [ref=' + ref + ']';
      if (value) line += ': ' + value;
      lines.push(line);
      depth++;
    }

    // For leaf nodes that are just text containers, show inline text
    if (shouldShow && el.childElementCount === 0 && !value) {
      const text = el.textContent?.trim();
      if (text && text.length > 0 && text.length < 500 && !name) {
        const indent = '  '.repeat(depth);
        lines.push(indent + '- text: ' + JSON.stringify(text));
      }
    }

    for (const child of el.children) {
      lines.push(...walk(child, depth));
    }

    return lines;
  }

  const lines = walk(document.body, 0);
  window.__stitch_ref_counter = refCounter;
  window.__stitch_ref_map = refMap;
  return { snapshot: lines.join('\\n'), refMap };
})()
`;

// Script to resolve a ref back to coordinates for clicking/interaction
function buildRefResolveScript(ref: string): string {
  return `
    (() => {
      const el = document.querySelector('[data-stitch-ref="${ref}"]');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        role: el.getAttribute('role') || '',
        isContentEditable: el.isContentEditable,
        isInput: el.tagName === 'INPUT' || el.tagName === 'TEXTAREA',
        isSelect: el.tagName === 'SELECT',
      };
    })()
  `;
}

function buildRefFocusScript(ref: string): string {
  return `
    (() => {
      const el = document.querySelector('[data-stitch-ref="${ref}"]');
      if (!el) return false;
      el.focus();
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.select();
      return true;
    })()
  `;
}

function buildSelectScript(ref: string, values: string[]): string {
  return `
    (() => {
      const el = document.querySelector('[data-stitch-ref="${ref}"]');
      if (!el || el.tagName !== 'SELECT') return [];
      const options = Array.from(el.options);
      const selected = [];
      for (const opt of options) {
        opt.selected = ${JSON.stringify(values)}.includes(opt.value);
        if (opt.selected) selected.push(opt.value);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return selected;
    })()
  `;
}

class BrowserManager {
  private client: CDPClient | null = null;
  private chromeProcess: ChildProcess | null = null;
  private port = 0;
  private activeTargetId: string | null = null;
  private targetSessions = new Map<string, CDPClient>();
  private refMap = new Map<string, RefEntry>();

  async launch(options: LaunchOptions = {}): Promise<void> {
    if (this.client?.isConnected) {
      log.info('Browser already running');
      return;
    }

    const instance = await launchChrome({
      userDataDir: PATHS.dirPaths.browserProfile,
      headless: options.headless,
      port: options.port,
      width: options.width ?? DEFAULT_WIDTH,
      height: options.height ?? DEFAULT_HEIGHT,
    });

    this.chromeProcess = instance.process;
    this.port = instance.port;

    const client = new CDPClient();
    await client.connect(instance.wsEndpoint);
    this.client = client;

    const targets = await this.listTabs();
    const page = targets.find((t) => t.type === 'page');
    if (page) {
      this.activeTargetId = page.id;
    } else {
      const newTab = await this.newTab();
      this.activeTargetId = newTab.id;
    }

    await this.ensurePageSession();
  }

  async close(): Promise<void> {
    for (const [, session] of this.targetSessions) {
      session.close();
    }
    this.targetSessions.clear();
    this.refMap.clear();

    this.client?.close();
    this.client = null;

    if (this.chromeProcess) {
      await killChrome(this.chromeProcess);
      this.chromeProcess = null;
    }

    this.activeTargetId = null;
    this.port = 0;
  }

  // ── Tab management ──────────────────────────────────────────

  async listTabs(): Promise<BrowserTab[]> {
    const response = await fetch(`http://127.0.0.1:${this.port}/json/list`);
    return (await response.json()) as BrowserTab[];
  }

  async newTab(url?: string): Promise<BrowserTab> {
    this.ensureConnected();
    const result = await this.client!.send('Target.createTarget', {
      url: url ?? 'about:blank',
    });
    const targetId = result.targetId as string;
    this.activeTargetId = targetId;
    this.refMap.clear();
    await this.ensurePageSession();

    return { id: targetId, title: '', url: url ?? 'about:blank', type: 'page' };
  }

  async focusTab(targetId: string): Promise<void> {
    this.ensureConnected();
    await this.client!.send('Target.activateTarget', { targetId });
    this.activeTargetId = targetId;
    this.refMap.clear();
    await this.ensurePageSession();
  }

  async closeTab(targetId?: string): Promise<void> {
    this.ensureConnected();
    const id = targetId ?? this.activeTargetId;
    if (!id) throw new Error('No active tab to close');

    await this.client!.send('Target.closeTarget', { targetId: id });

    const session = this.targetSessions.get(id);
    if (session) {
      session.close();
      this.targetSessions.delete(id);
    }

    if (this.activeTargetId === id) {
      this.refMap.clear();
      const remaining = await this.listTabs();
      const page = remaining.find((t) => t.type === 'page');
      this.activeTargetId = page?.id ?? null;
      if (this.activeTargetId) {
        await this.ensurePageSession();
      }
    }
  }

  // ── Navigation ──────────────────────────────────────────────

  async navigate(url: string): Promise<string> {
    const session = await this.getPageSession();
    this.refMap.clear();

    await session.send('Page.navigate', { url });
    await this.waitForLoad(session);
    await this.settle();

    const [title, pageUrl] = await Promise.all([
      this.getPageTitle(session),
      this.getPageUrl(session),
    ]);

    return `Navigated to ${pageUrl} — "${title}"`;
  }

  async goBack(): Promise<string> {
    const session = await this.getPageSession();
    const entry = await this.getHistoryEntry(session, -1);
    if (!entry) throw new Error('No previous history entry');

    this.refMap.clear();
    await session.send('Page.navigateToHistoryEntry', { entryId: entry.id });
    await this.waitForLoad(session);
    await this.settle();
    return `Navigated back to ${entry.url} — "${entry.title}"`;
  }

  async goForward(): Promise<string> {
    const session = await this.getPageSession();
    const entry = await this.getHistoryEntry(session, 1);
    if (!entry) throw new Error('No forward history entry');

    this.refMap.clear();
    await session.send('Page.navigateToHistoryEntry', { entryId: entry.id });
    await this.waitForLoad(session);
    await this.settle();
    return `Navigated forward to ${entry.url} — "${entry.title}"`;
  }

  // ── Interaction ─────────────────────────────────────────────

  async click(
    ref: string,
    options?: { doubleClick?: boolean; button?: string; modifiers?: string[] },
  ): Promise<string> {
    const session = await this.getPageSession();
    const resolved = await this.resolveRef(session, ref);
    if (!resolved) throw new Error(`Ref "${ref}" not found. Take a new snapshot first.`);

    const button = options?.button ?? 'left';
    const clickCount = options?.doubleClick ? 2 : 1;
    const modifiers = resolveModifiers(options?.modifiers);

    // Navigate-aware click: listen for frameNavigated during the click
    let navigated = false;
    const navHandler = () => {
      navigated = true;
    };
    session.on('Page.frameNavigated', navHandler);

    await session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: resolved.x,
      y: resolved.y,
      button,
      clickCount,
      modifiers,
    });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: resolved.x,
      y: resolved.y,
      button,
      clickCount,
      modifiers,
    });

    await this.settle();

    if (navigated) {
      this.refMap.clear();
      await this.waitForLoad(session);
      await this.settle();
    }

    session.off('Page.frameNavigated', navHandler);
    return `Clicked ${ref} at (${resolved.x}, ${resolved.y})`;
  }

  async hover(ref: string): Promise<string> {
    const session = await this.getPageSession();
    const resolved = await this.resolveRef(session, ref);
    if (!resolved) throw new Error(`Ref "${ref}" not found. Take a new snapshot first.`);

    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: resolved.x,
      y: resolved.y,
    });

    return `Hovered over ${ref} at (${resolved.x}, ${resolved.y})`;
  }

  async type(ref: string, text: string, options?: { slowly?: boolean; submit?: boolean }): Promise<string> {
    const session = await this.getPageSession();

    // Focus the element first
    const focusResult = await this.evalInPage(session, buildRefFocusScript(ref));
    if (!focusResult) throw new Error(`Ref "${ref}" not found. Take a new snapshot first.`);

    if (options?.slowly) {
      for (const char of text) {
        const keyDef = resolveKey(char);
        await session.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyDef });
        await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyDef });
      }
    } else {
      await session.send('Input.insertText', { text });
    }

    if (options?.submit) {
      await this.press('Enter');
    }

    return `Typed "${text}" into ${ref}${options?.submit ? ' and submitted' : ''}`;
  }

  async press(key: string): Promise<string> {
    const session = await this.getPageSession();
    const keyDef = resolveKey(key);

    let navigated = false;
    const navHandler = () => {
      navigated = true;
    };

    // Enter might trigger navigation
    if (key === 'Enter') {
      session.on('Page.frameNavigated', navHandler);
    }

    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyDef });
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyDef });

    if (key === 'Enter') {
      await this.settle();
      if (navigated) {
        this.refMap.clear();
        await this.waitForLoad(session);
        await this.settle();
      }
      session.off('Page.frameNavigated', navHandler);
    }

    return `Pressed "${key}"`;
  }

  async select(ref: string, values: string[]): Promise<string> {
    const session = await this.getPageSession();
    const result = await this.evalInPage(session, buildSelectScript(ref, values));
    const selected = Array.isArray(result) ? (result as string[]) : [];
    return `Selected values in ${ref}: ${JSON.stringify(selected)}`;
  }

  async scroll(
    ref: string | undefined,
    direction: ScrollDirection,
  ): Promise<string> {
    const session = await this.getPageSession();

    let x = DEFAULT_WIDTH / 2;
    let y = DEFAULT_HEIGHT / 2;

    if (ref) {
      const resolved = await this.resolveRef(session, ref);
      if (resolved) {
        x = resolved.x;
        y = resolved.y;
      }
    }

    const deltaX = direction === 'left' ? -300 : direction === 'right' ? 300 : 0;
    const deltaY = direction === 'up' ? -300 : direction === 'down' ? 300 : 0;

    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaX,
      deltaY,
    });

    const target = ref ? `at ${ref}` : 'page';
    return `Scrolled ${direction} on ${target}`;
  }

  // ── Page inspection ─────────────────────────────────────────

  async snapshot(): Promise<string> {
    const session = await this.getPageSession();

    const result = await this.evalInPage(session, SNAPSHOT_SCRIPT);
    if (!result || typeof result !== 'object') {
      return '### Snapshot\n[empty page]';
    }

    const data = result as { snapshot: string; refMap: Record<string, RefEntry> };

    // Update our server-side ref map
    this.refMap.clear();
    if (data.refMap) {
      for (const [ref, entry] of Object.entries(data.refMap)) {
        this.refMap.set(ref, entry);
      }
    }

    const [title, url] = await Promise.all([
      this.getPageTitle(session),
      this.getPageUrl(session),
    ]);

    const header = `### Page\n- URL: ${url}\n- Title: ${title}\n`;
    const snapshot = data.snapshot || '[empty page]';
    return `${header}\n### Snapshot\n${snapshot}`;
  }

  async screenshot(): Promise<ScreenshotResult> {
    const session = await this.getPageSession();
    const result = await session.send('Page.captureScreenshot', {
      format: 'png',
      quality: 80,
    });

    return { data: result.data as string, format: 'png' };
  }

  async evaluate(expression: string): Promise<unknown> {
    const session = await this.getPageSession();
    const result = await session.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    const exceptionDetails = result.exceptionDetails as Record<string, unknown> | undefined;
    if (exceptionDetails) {
      const text = (exceptionDetails.text as string) ?? 'Script evaluation failed';
      throw new Error(text);
    }

    return (result.result as Record<string, unknown>)?.value;
  }

  async resize(width: number, height: number): Promise<string> {
    const session = await this.getPageSession();
    await session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    return `Resized viewport to ${width}x${height}`;
  }

  async wait(timeMs?: number, selector?: string): Promise<string> {
    if (selector) {
      const session = await this.getPageSession();
      const start = Date.now();
      const timeout = timeMs ?? 5000;
      while (Date.now() - start < timeout) {
        const found = await this.evalInPage(
          session,
          `!!document.querySelector(${JSON.stringify(selector)})`,
        );
        if (found) return `Found selector "${selector}"`;
        await this.settle(200);
      }
      throw new Error(`Timeout waiting for selector "${selector}" after ${timeout}ms`);
    }

    await new Promise<void>((resolve) => setTimeout(resolve, timeMs ?? 1000));
    return `Waited ${timeMs ?? 1000}ms`;
  }

  // ── Internal helpers ────────────────────────────────────────

  private ensureConnected(): void {
    if (!this.client?.isConnected) {
      throw new Error('Browser is not running. The browser tool will launch it automatically.');
    }
  }

  private async ensurePageSession(): Promise<CDPClient> {
    if (!this.activeTargetId) {
      throw new Error('No active target');
    }

    const existing = this.targetSessions.get(this.activeTargetId);
    if (existing?.isConnected) return existing;

    this.ensureConnected();

    // Attach to the target so Chrome keeps it alive
    await this.client!.send('Target.attachToTarget', {
      targetId: this.activeTargetId,
      flatten: true,
    });

    const tabs = await this.listTabs();
    const tab = tabs.find((t) => t.id === this.activeTargetId);

    if (tab?.webSocketDebuggerUrl) {
      const session = new CDPClient();
      await session.connect(tab.webSocketDebuggerUrl);
      await session.send('Page.enable', {});
      await session.send('Runtime.enable', {});
      await session.send('Network.enable', {});
      this.targetSessions.set(this.activeTargetId, session);
      return session;
    }

    throw new Error(`Could not establish session for target ${this.activeTargetId}`);
  }

  private async getPageSession(): Promise<CDPClient> {
    // If the browser connection died, clean up stale state so re-launch works
    if (this.client && !this.client.isConnected) {
      log.info('Browser connection lost, cleaning up for re-launch');
      this.cleanupStaleState();
    }

    if (!this.client) {
      await this.launch();
    }
    return this.ensurePageSession();
  }

  private cleanupStaleState(): void {
    for (const [, session] of this.targetSessions) {
      session.close();
    }
    this.targetSessions.clear();
    this.refMap.clear();
    this.client?.close();
    this.client = null;
    this.chromeProcess = null;
    this.activeTargetId = null;
    this.port = 0;
  }

  private async waitForLoad(session: CDPClient): Promise<void> {
    return new Promise<void>((resolve) => {
      let resolved = false;

      const done = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        session.off('Page.loadEventFired', onLoad);
        resolve();
      };

      const timer = setTimeout(done, LOAD_TIMEOUT_MS);
      const onLoad = () => done();

      session.on('Page.loadEventFired', onLoad);
    });
  }

  private async settle(ms?: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms ?? SETTLE_MS));
  }

  private async getPageTitle(session: CDPClient): Promise<string> {
    const result = await session.send('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true,
    });
    return ((result.result as Record<string, unknown>)?.value as string) ?? '';
  }

  private async getPageUrl(session: CDPClient): Promise<string> {
    const result = await session.send('Runtime.evaluate', {
      expression: 'location.href',
      returnByValue: true,
    });
    return ((result.result as Record<string, unknown>)?.value as string) ?? '';
  }

  private async evalInPage(session: CDPClient, expression: string): Promise<unknown> {
    const result = await session.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return (result.result as Record<string, unknown>)?.value;
  }

  private async resolveRef(
    session: CDPClient,
    ref: string,
  ): Promise<{ x: number; y: number } | null> {
    const result = await this.evalInPage(session, buildRefResolveScript(ref));
    if (!result || typeof result !== 'object') return null;
    const data = result as { x: number; y: number };
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return null;
    return data;
  }

  private async getHistoryEntry(
    session: CDPClient,
    offset: number,
  ): Promise<NavigationEntry | null> {
    const history = await session.send('Page.getNavigationHistory', {});
    const currentIndex = history.currentIndex as number;
    const entries = history.entries as NavigationEntry[];
    const targetIndex = currentIndex + offset;

    if (targetIndex < 0 || targetIndex >= entries.length) return null;
    return entries[targetIndex];
  }
}

// ── Key helpers ─────────────────────────────────────────────

type KeyDefinition = {
  key: string;
  code: string;
  keyCode?: number;
  windowsVirtualKeyCode?: number;
};

const KEY_MAP: Record<string, KeyDefinition> = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, windowsVirtualKeyCode: 13 },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9, windowsVirtualKeyCode: 9 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8, windowsVirtualKeyCode: 8 },
  Delete: { key: 'Delete', code: 'Delete', keyCode: 46, windowsVirtualKeyCode: 46 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27, windowsVirtualKeyCode: 27 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, windowsVirtualKeyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, windowsVirtualKeyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, windowsVirtualKeyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, windowsVirtualKeyCode: 39 },
  Home: { key: 'Home', code: 'Home', keyCode: 36, windowsVirtualKeyCode: 36 },
  End: { key: 'End', code: 'End', keyCode: 35, windowsVirtualKeyCode: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33, windowsVirtualKeyCode: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34, windowsVirtualKeyCode: 34 },
  Space: { key: ' ', code: 'Space', keyCode: 32, windowsVirtualKeyCode: 32 },
};

function resolveKey(key: string): KeyDefinition {
  const mapped = KEY_MAP[key];
  if (mapped) return mapped;

  if (key.length === 1) {
    const code = key.charCodeAt(0);
    return { key, code: `Key${key.toUpperCase()}`, keyCode: code, windowsVirtualKeyCode: code };
  }

  return { key, code: key };
}

function resolveModifiers(mods?: string[]): number {
  if (!mods || mods.length === 0) return 0;
  let mask = 0;
  for (const mod of mods) {
    if (mod === 'Alt') mask |= 1;
    if (mod === 'Control') mask |= 2;
    if (mod === 'Meta') mask |= 4;
    if (mod === 'Shift') mask |= 8;
  }
  return mask;
}

// ── Singleton ───────────────────────────────────────────────

let instance: BrowserManager | null = null;

export function getBrowserManager(): BrowserManager {
  if (!instance) {
    instance = new BrowserManager();
  }
  return instance;
}
