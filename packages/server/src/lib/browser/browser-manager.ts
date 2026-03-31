import { CDPClient } from '@/lib/browser/cdp-client.js';
import { killChrome, launchChrome } from '@/lib/browser/chrome-launcher.js';
import type {
  BrowserTab,
  FindElementsResult,
  LaunchOptions,
  PageStats,
  RefEntry,
  ScreenshotResult,
  ScrollDirection,
  ScrollInfo,
  SearchPageResult,
} from '@/lib/browser/types.js';
import { needsIIFEWrap } from '@/lib/browser/utils.js';
import { DownloadWatchdog } from '@/lib/browser/watchdogs/download-watchdog.js';
import { PopupWatchdog } from '@/lib/browser/watchdogs/popup-watchdog.js';
import { SessionHealthWatchdog } from '@/lib/browser/watchdogs/session-health-watchdog.js';
import { StorageStateManager } from '@/lib/browser/watchdogs/storage-state-manager.js';
import * as Log from '@/lib/log.js';
import { getBrowserProfilePath } from '@/lib/paths.js';
import { listSettings } from '@/settings/service.js';
import type { ChildProcess } from 'node:child_process';

const log = Log.create({ service: 'browser.manager' });

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const SETTLE_MS = 500;
const LOAD_TIMEOUT_MS = 10_000;
const SNAPSHOT_MAX_NODES = 5000;
const SNAPSHOT_MAX_CHARS = 50_000;
const SNAPSHOT_MAX_DEPTH = 30;

const DEFAULT_BROWSER_PROFILE_DIR = getBrowserProfilePath('chrome', 'Default');

async function resolveActiveProfileDir(): Promise<string> {
  // Profile importing is not supported on Windows; always use the default clean profile.
  if (process.platform === 'win32') return DEFAULT_BROWSER_PROFILE_DIR;

  const settings = await listSettings();
  const activeProfile = settings['browser.activeProfile'];
  if (!activeProfile) return DEFAULT_BROWSER_PROFILE_DIR;

  const parts = activeProfile.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return DEFAULT_BROWSER_PROFILE_DIR;

  return getBrowserProfilePath(parts[0], parts[1]);
}

type NavigationEntry = {
  id: number;
  url: string;
  title: string;
};



// ── Injected snapshot script ────────────────────────────────
// Runs inside the browser to build a YAML-like accessibility tree with refs.
// Assigns "eN" refs to interactable/visible elements and stores backendNodeId
// so we can resolve refs later via CDP DOM commands.
// Includes viewport filtering, scroll position, page stats, select compression,
// and new-element markers.

const SNAPSHOT_SCRIPT = `
(() => {
  const prevRefs = window.__stitch_prev_refs || new Set();
  let refCounter = window.__stitch_ref_counter || 0;
  const refMap = {};
  const newRefs = new Set();
  let nodeCount = 0;
  let charCount = 0;
  const MAX_NODES = ${SNAPSHOT_MAX_NODES};
  const MAX_CHARS = ${SNAPSHOT_MAX_CHARS};
  const MAX_DEPTH = ${SNAPSHOT_MAX_DEPTH};
  let truncated = false;

  // Page stats
  let statLinks = 0, statInteractive = 0, statIframes = 0, statImages = 0, statTotal = 0;

  // Viewport bounds for filtering (elements far off-screen are skipped)
  const vpH = window.innerHeight || document.documentElement.clientHeight;
  const vpW = window.innerWidth || document.documentElement.clientWidth;
  const VIEWPORT_MARGIN = vpH * 1.5; // Include elements within 1.5 viewports

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
    if (el.tagName === 'A') {
      const text = el.textContent?.trim() || '';
      return text.length > 80 ? text.slice(0, 80) + '...' : text;
    }
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

  function isNearViewport(el) {
    const rect = el.getBoundingClientRect();
    // Include fixed/sticky elements regardless of position
    const style = getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'sticky') return true;
    // Filter elements far off-screen
    return rect.bottom > -VIEWPORT_MARGIN && rect.top < vpH + VIEWPORT_MARGIN;
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
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.getAttribute('type') === 'password') return '••••••';
      return el.value || '';
    }
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
    if (el.required) attrs.push('required');
    if (role === 'heading') {
      const tag = el.tagName.toLowerCase();
      const level = tag.match(/^h(\\d)$/);
      if (level) attrs.push('level=' + level[1]);
    }
    const href = el.getAttribute('href');
    if (href && role === 'link') attrs.push('url=' + href);
    return attrs;
  }

  // Compress <select> elements: show selected value + option count instead of full tree
  function compressSelect(el, depth, ref) {
    const indent = '  '.repeat(depth);
    const options = Array.from(el.options);
    const selected = Array.from(el.selectedOptions).map(o => o.textContent?.trim()).filter(Boolean);
    const selectedText = selected.length > 0 ? selected.join(', ') : '(none)';
    let line = indent + '- combobox';
    const name = getName(el);
    if (name) line += ' ' + JSON.stringify(name);
    if (ref) line += ' [ref=' + ref + ']';
    line += ': ' + selectedText + ' (' + options.length + ' options)';
    charCount += line.length;
    return [line];
  }

  function walk(el, depth) {
    if (!el || el.nodeType !== 1) return [];
    if (truncated) return [];
    if (depth > MAX_DEPTH) return [];
    if (el.getAttribute('aria-hidden') === 'true') return [];
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'template', 'meta', 'link', 'head', 'svg'].includes(tag)) return [];
    if (!isVisible(el)) return [];

    // Count stats before any filtering
    statTotal++;
    if (tag === 'a') statLinks++;
    if (tag === 'iframe' || tag === 'frame') statIframes++;
    if (tag === 'img') statImages++;

    // Viewport filtering for non-structural elements
    if (depth > 2 && !isNearViewport(el)) return [];

    if (nodeCount >= MAX_NODES || charCount >= MAX_CHARS) {
      truncated = true;
      return [];
    }

    const role = getRole(el);
    const name = getName(el);
    const value = getValue(el);
    const attrs = getAttributes(el, role);
    const lines = [];

    const shouldShow = role !== 'generic' || name;
    const interact = isInteractable(el);
    const assignRef = shouldShow && interact;

    let ref = null;
    if (assignRef) {
      refCounter++;
      ref = 'e' + refCounter;
      refMap[ref] = { backendNodeId: null, role, name };
      el.setAttribute('data-stitch-ref', ref);
      newRefs.add(ref);
      statInteractive++;
    }

    // Compressed <select> rendering
    if (tag === 'select' && ref) {
      return compressSelect(el, depth, ref);
    }

    if (shouldShow) {
      nodeCount++;
      const indent = '  '.repeat(depth);
      let line = indent + '- ' + role;
      if (name) line += ' ' + JSON.stringify(name);
      for (const attr of attrs) line += ' [' + attr + ']';
      // Mark new elements with * prefix
      if (ref && !prevRefs.has(ref)) {
        line += ' *[ref=' + ref + ']';
      } else if (ref) {
        line += ' [ref=' + ref + ']';
      }
      if (value) line += ': ' + value;
      charCount += line.length;
      lines.push(line);
      depth++;
    }

    // For leaf nodes that are just text containers, show inline text
    if (shouldShow && el.childElementCount === 0 && !value) {
      const text = el.textContent?.trim();
      if (text && text.length > 0 && text.length < 500 && !name) {
        const indent = '  '.repeat(depth);
        const line = indent + '- text: ' + JSON.stringify(text);
        charCount += line.length;
        lines.push(line);
      }
    }

    for (const child of el.children) {
      if (truncated) break;
      lines.push(...walk(child, depth));
    }

    return lines;
  }

  const lines = walk(document.body, 0);

  // Save refs for next snapshot comparison
  window.__stitch_ref_counter = refCounter;
  window.__stitch_ref_map = refMap;
  window.__stitch_prev_refs = newRefs;

  // Scroll info
  const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
  const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
  const pagesAbove = vpH > 0 ? Math.round((scrollTop / vpH) * 10) / 10 : 0;
  const pagesBelow = vpH > 0 ? Math.round(((scrollHeight - scrollTop - vpH) / vpH) * 10) / 10 : 0;

  const meta = {
    nodes: nodeCount,
    chars: charCount,
    truncated,
    scroll: { scrollTop, scrollHeight, viewportHeight: vpH, pagesAbove, pagesBelow },
    stats: { links: statLinks, interactive: statInteractive, iframes: statIframes, images: statImages, totalElements: statTotal },
  };
  return { snapshot: lines.join('\\n'), refMap, meta };
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

  // Internal watchdogs
  private popupWatchdog = new PopupWatchdog();
  private downloadWatchdog = new DownloadWatchdog();
  private sessionHealthWatchdog = new SessionHealthWatchdog();
  private storageStateManager = new StorageStateManager();

  // ── Abort helpers ───────────────────────────────────────────

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException('Browser action aborted', 'AbortError');
    }
  }

  private async abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (!signal) {
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
      return;
    }

    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Browser action aborted', 'AbortError'));
        return;
      }
      const id = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(id);
          reject(new DOMException('Browser action aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }

  async launch(options: LaunchOptions = {}): Promise<void> {
    if (this.client?.isConnected) {
      log.info('Browser already running');
      return;
    }

    const userDataDir = await resolveActiveProfileDir();
    const instance = await launchChrome({
      userDataDir,
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

    // Attach browser-level watchdogs
    this.sessionHealthWatchdog.attach(client, {
      onTargetDestroyed: (targetId) => this.handleTargetDestroyed(targetId),
      onTargetCrashed: (targetId) => this.handleTargetCrashed(targetId),
    });
    await this.downloadWatchdog.attach(client);

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
    // Detach watchdogs
    this.popupWatchdog.detachAll();
    this.downloadWatchdog.detach();
    this.sessionHealthWatchdog.detach();
    this.storageStateManager.detach();

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

  // ── Target lifecycle handlers (from session health watchdog) ──

  private handleTargetDestroyed(targetId: string): void {
    const session = this.targetSessions.get(targetId);
    if (session) {
      this.popupWatchdog.detach(session);
      session.close();
      this.targetSessions.delete(targetId);
    }

    if (this.activeTargetId === targetId) {
      this.refMap.clear();
      this.activeTargetId = null;
      log.info({ targetId }, 'Active target destroyed, will recover on next action');
    }
  }

  private handleTargetCrashed(targetId: string): void {
    // If targetId is empty, it means Inspector.targetCrashed (active target)
    const crashedId = targetId || this.activeTargetId;
    if (!crashedId) return;

    log.warn({ targetId: crashedId }, 'Target crashed, cleaning up');
    this.handleTargetDestroyed(crashedId);
  }

  /** Expose download info for Stitch */
  getDownloads() {
    return this.downloadWatchdog.getDownloads();
  }

  getCompletedDownloads() {
    return this.downloadWatchdog.getCompletedDownloads();
  }

  /** Expose storage state management */
  async saveStorageState(filePath?: string) {
    return this.storageStateManager.save(filePath);
  }

  async loadStorageState(filePath?: string) {
    return this.storageStateManager.load(filePath);
  }

  // ── Tab management ──────────────────────────────────────────

  async listTabs(signal?: AbortSignal): Promise<BrowserTab[]> {
    this.throwIfAborted(signal);
    const response = await fetch(`http://127.0.0.1:${this.port}/json/list`);
    return (await response.json()) as BrowserTab[];
  }

  async newTab(url?: string, signal?: AbortSignal): Promise<BrowserTab> {
    this.throwIfAborted(signal);
    this.ensureConnected();
    const result = await this.client!.send(
      'Target.createTarget',
      {
        url: url ?? 'about:blank',
      },
      signal,
    );
    const targetId = result.targetId as string;
    this.activeTargetId = targetId;
    this.refMap.clear();
    await this.ensurePageSession();

    return { id: targetId, title: '', url: url ?? 'about:blank', type: 'page' };
  }

  async focusTab(targetId: string, signal?: AbortSignal): Promise<void> {
    this.throwIfAborted(signal);
    this.ensureConnected();
    await this.client!.send('Target.activateTarget', { targetId }, signal);
    this.activeTargetId = targetId;
    this.refMap.clear();
    await this.ensurePageSession();
  }

  async closeTab(targetId?: string, signal?: AbortSignal): Promise<void> {
    this.throwIfAborted(signal);
    this.ensureConnected();
    const id = targetId ?? this.activeTargetId;
    if (!id) throw new Error('No active tab to close');

    await this.client!.send('Target.closeTarget', { targetId: id }, signal);

    const session = this.targetSessions.get(id);
    if (session) {
      session.close();
      this.targetSessions.delete(id);
    }

    if (this.activeTargetId === id) {
      this.refMap.clear();
      const remaining = await this.listTabs(signal);
      const page = remaining.find((t) => t.type === 'page');
      this.activeTargetId = page?.id ?? null;
      if (this.activeTargetId) {
        await this.ensurePageSession();
      }
    }
  }

  // ── Navigation ──────────────────────────────────────────────

  async navigate(url: string, signal?: AbortSignal): Promise<string> {
    this.throwIfAborted(signal);
    const session = await this.getPageSession();
    this.refMap.clear();

    await session.send('Page.navigate', { url }, signal);
    await this.waitForLoad(session, signal);
    await this.settle(undefined, signal);

    const [title, pageUrl] = await Promise.all([
      this.getPageTitle(session),
      this.getPageUrl(session),
    ]);

    return `Navigated to ${pageUrl} — "${title}"`;
  }

  async goBack(signal?: AbortSignal): Promise<string> {
    this.throwIfAborted(signal);
    const session = await this.getPageSession();
    const entry = await this.getHistoryEntry(session, -1);
    if (!entry) throw new Error('No previous history entry');

    this.refMap.clear();
    await session.send('Page.navigateToHistoryEntry', { entryId: entry.id }, signal);
    await this.waitForLoad(session, signal);
    await this.settle(undefined, signal);
    return `Navigated back to ${entry.url} — "${entry.title}"`;
  }

  async goForward(signal?: AbortSignal): Promise<string> {
    this.throwIfAborted(signal);
    const session = await this.getPageSession();
    const entry = await this.getHistoryEntry(session, 1);
    if (!entry) throw new Error('No forward history entry');

    this.refMap.clear();
    await session.send('Page.navigateToHistoryEntry', { entryId: entry.id }, signal);
    await this.waitForLoad(session, signal);
    await this.settle(undefined, signal);
    return `Navigated forward to ${entry.url} — "${entry.title}"`;
  }

  // ── Interaction ─────────────────────────────────────────────

  async click(
    ref: string,
    options?: {
      doubleClick?: boolean;
      button?: string;
      modifiers?: string[];
      signal?: AbortSignal;
    },
  ): Promise<string> {
    const signal = options?.signal;
    this.throwIfAborted(signal);
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

    await session.send(
      'Input.dispatchMouseEvent',
      {
        type: 'mousePressed',
        x: resolved.x,
        y: resolved.y,
        button,
        clickCount,
        modifiers,
      },
      signal,
    );
    await session.send(
      'Input.dispatchMouseEvent',
      {
        type: 'mouseReleased',
        x: resolved.x,
        y: resolved.y,
        button,
        clickCount,
        modifiers,
      },
      signal,
    );

    await this.settle(undefined, signal);

    if (navigated) {
      this.refMap.clear();
      await this.waitForLoad(session, signal);
      await this.settle(undefined, signal);
    }

    session.off('Page.frameNavigated', navHandler);
    return `Clicked ${ref} at (${resolved.x}, ${resolved.y})`;
  }

  async hover(ref: string, signal?: AbortSignal): Promise<string> {
    this.throwIfAborted(signal);
    const session = await this.getPageSession();
    const resolved = await this.resolveRef(session, ref);
    if (!resolved) throw new Error(`Ref "${ref}" not found. Take a new snapshot first.`);

    await session.send(
      'Input.dispatchMouseEvent',
      {
        type: 'mouseMoved',
        x: resolved.x,
        y: resolved.y,
      },
      signal,
    );

    return `Hovered over ${ref} at (${resolved.x}, ${resolved.y})`;
  }

  async type(ref: string, text: string, options?: { slowly?: boolean; submit?: boolean; clear?: boolean; signal?: AbortSignal }): Promise<string> {
    const signal = options?.signal;
    this.throwIfAborted(signal);
    const session = await this.getPageSession();

    // Focus the element first
    const focusResult = await this.evalInPage(session, buildRefFocusScript(ref));
    if (!focusResult) throw new Error(`Ref "${ref}" not found. Take a new snapshot first.`);

    // Clear field before typing if requested
    if (options?.clear) {
      await this.evalInPage(session, `
        (() => {
          const el = document.querySelector('[data-stitch-ref="${ref}"]');
          if (!el) return;
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (el.isContentEditable) {
            el.textContent = '';
          }
        })()
      `);
    }

    if (options?.slowly) {
      for (const char of text) {
        this.throwIfAborted(signal);
        const keyDef = resolveKey(char);
        await session.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyDef }, signal);
        await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyDef }, signal);
      }
    } else {
      await session.send('Input.insertText', { text }, signal);
    }

    if (options?.submit) {
      await this.press('Enter', signal);
    }

    return `Typed "${text}" into ${ref}${options?.clear ? ' (cleared first)' : ''}${options?.submit ? ' and submitted' : ''}`;
  }

  async press(key: string, signal?: AbortSignal): Promise<string> {
    this.throwIfAborted(signal);
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

    await session.send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyDef }, signal);
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyDef }, signal);

    if (key === 'Enter') {
      await this.settle(undefined, signal);
      if (navigated) {
        this.refMap.clear();
        await this.waitForLoad(session, signal);
        await this.settle(undefined, signal);
      }
      session.off('Page.frameNavigated', navHandler);
    }

    return `Pressed "${key}"`;
  }

  async select(ref: string, values: string[], signal?: AbortSignal): Promise<string> {
    this.throwIfAborted(signal);
    const session = await this.getPageSession();
    const result = await this.evalInPage(session, buildSelectScript(ref, values));
    const selected = Array.isArray(result) ? (result as string[]) : [];
    return `Selected values in ${ref}: ${JSON.stringify(selected)}`;
  }

  async scroll(
    ref: string | undefined,
    direction: ScrollDirection,
    signal?: AbortSignal,
  ): Promise<string> {
    this.throwIfAborted(signal);
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

    await session.send(
      'Input.dispatchMouseEvent',
      {
        type: 'mouseWheel',
        x,
        y,
        deltaX,
        deltaY,
      },
      signal,
    );

    const target = ref ? `at ${ref}` : 'page';
    return `Scrolled ${direction} on ${target}`;
  }

  // ── Page inspection ─────────────────────────────────────────

  async snapshot(signal?: AbortSignal): Promise<string> {
    this.throwIfAborted(signal);
    const session = await this.getPageSession();

    const result = await this.evalInPage(session, SNAPSHOT_SCRIPT);
    if (!result || typeof result !== 'object') {
      return '### Snapshot\n[empty page]';
    }

    const data = result as {
      snapshot: string;
      refMap: Record<string, RefEntry>;
      meta: {
        nodes: number;
        chars: number;
        truncated: boolean;
        scroll: ScrollInfo;
        stats: PageStats;
      };
    };

    // Update our server-side ref map
    this.refMap.clear();
    if (data.refMap) {
      for (const [ref, entry] of Object.entries(data.refMap)) {
        this.refMap.set(ref, entry);
      }
    }

    const [title, url] = await Promise.all([this.getPageTitle(session), this.getPageUrl(session)]);

    // Build enriched header
    const lines: string[] = [];
    lines.push(`### Page`);
    lines.push(`- URL: ${url}`);
    lines.push(`- Title: ${title}`);

    // Tabs
    try {
      const tabs = await this.listTabs(signal);
      const pageTabs = tabs.filter((t) => t.type === 'page');
      if (pageTabs.length > 1) {
        lines.push(`- Tabs (${pageTabs.length}):`);
        for (const t of pageTabs) {
          const marker = t.id === this.activeTargetId ? ' (active)' : '';
          const tabTitle = t.title ? t.title.slice(0, 40) : '(untitled)';
          lines.push(`    ${t.id}: ${tabTitle} — ${t.url}${marker}`);
        }
      }
    } catch {
      // tabs listing is best-effort
    }

    // Scroll position
    if (data.meta?.scroll) {
      const s = data.meta.scroll;
      const scrollParts: string[] = [];
      if (s.pagesAbove > 0) scrollParts.push(`${s.pagesAbove} pages above`);
      if (s.pagesBelow > 0) scrollParts.push(`${s.pagesBelow} pages below`);
      if (scrollParts.length > 0) {
        lines.push(`- Scroll: ${scrollParts.join(', ')}${s.pagesBelow > 0.2 ? ' — scroll down to reveal more content' : ''}`);
      }
    }

    // Page stats
    if (data.meta?.stats) {
      const st = data.meta.stats;
      lines.push(`- Stats: ${st.links} links, ${st.interactive} interactive, ${st.iframes} iframes, ${st.images} images, ${st.totalElements} total elements`);
    }

    lines.push('');

    // Snapshot body with start/end markers
    const snapshot = data.snapshot || '[empty page]';
    const scroll = data.meta?.scroll;
    const atTop = !scroll || scroll.pagesAbove === 0;
    const atBottom = !scroll || scroll.pagesBelow === 0;

    if (atTop) lines.push('[Start of page]');
    lines.push('### Accessibility Tree');
    lines.push(snapshot);
    if (atBottom) lines.push('[End of page]');

    const truncNote = data.meta?.truncated
      ? `\n\n[Snapshot truncated: ${data.meta.nodes} nodes, ${data.meta.chars} chars. Use search_page or find_elements for more detail.]`
      : '';

    return lines.join('\n') + truncNote;
  }

  async screenshot(signal?: AbortSignal): Promise<ScreenshotResult> {
    this.throwIfAborted(signal);
    const session = await this.getPageSession();
    const result = await session.send(
      'Page.captureScreenshot',
      {
        format: 'png',
        quality: 80,
      },
      signal,
    );

    return { data: result.data as string, format: 'png' };
  }

  async evaluate(expression: string, signal?: AbortSignal): Promise<unknown> {
    this.throwIfAborted(signal);
    const session = await this.getPageSession();

    // Auto-wrap expressions containing top-level `return` in an IIFE
    const wrapped = needsIIFEWrap(expression) ? `(()=>{${expression}})()` : expression;

    const result = await session.send('Runtime.evaluate', {
      expression: wrapped,
      returnByValue: true,
      awaitPromise: true,
    }, signal);

    const exceptionDetails = result.exceptionDetails as Record<string, unknown> | undefined;
    if (exceptionDetails) {
      const exObj = exceptionDetails.exception as Record<string, unknown> | undefined;
      const description = exObj?.description as string | undefined;
      const text = (exceptionDetails.text as string) ?? 'Script evaluation failed';
      const lineNumber = exceptionDetails.lineNumber as number | undefined;
      const columnNumber = exceptionDetails.columnNumber as number | undefined;

      const parts = [description ?? text];
      if (lineNumber !== undefined) parts.push(`at line ${lineNumber + 1}${columnNumber !== undefined ? `:${columnNumber + 1}` : ''}`);
      throw new Error(parts.join(' '));
    }

    return (result.result as Record<string, unknown>)?.value;
  }

  // ── Lightweight page search tools ──────────────────────────

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
    this.throwIfAborted(signal);
    const session = await this.getPageSession();
    const js = buildSearchPageScript(options);
    const result = await this.evalInPage(session, js);

    if (!result || typeof result !== 'object') {
      return { matches: [], total: 0 };
    }

    const data = result as SearchPageResult & { error?: string };
    if (data.error) throw new Error(`search_page: ${data.error}`);
    return { matches: data.matches ?? [], total: data.total ?? 0 };
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
    this.throwIfAborted(signal);
    const session = await this.getPageSession();
    const js = buildFindElementsScript(options);
    const result = await this.evalInPage(session, js);

    if (!result || typeof result !== 'object') {
      return { elements: [], total: 0 };
    }

    const data = result as FindElementsResult & { error?: string };
    if (data.error) throw new Error(`find_elements: ${data.error}`);
    return { elements: data.elements ?? [], total: data.total ?? 0 };
  }

  async resize(width: number, height: number, signal?: AbortSignal): Promise<string> {
    this.throwIfAborted(signal);
    const session = await this.getPageSession();
    await session.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      },
      signal,
    );
    return `Resized viewport to ${width}x${height}`;
  }

  async wait(timeMs?: number, selector?: string, signal?: AbortSignal): Promise<string> {
    if (selector) {
      this.throwIfAborted(signal);
      const session = await this.getPageSession();
      const start = Date.now();
      const timeout = timeMs ?? 5000;
      while (Date.now() - start < timeout) {
        this.throwIfAborted(signal);
        const found = await this.evalInPage(
          session,
          `!!document.querySelector(${JSON.stringify(selector)})`,
        );
        if (found) return `Found selector "${selector}"`;
        await this.abortableSleep(200, signal);
      }
      throw new Error(`Timeout waiting for selector "${selector}" after ${timeout}ms`);
    }

    await this.abortableSleep(timeMs ?? 1000, signal);
    return `Waited ${timeMs ?? 1000}ms`;
  }

  // ── Web search ──────────────────────────────────────────────

  async search(query: string, engine: string = 'google', signal?: AbortSignal): Promise<string> {
    this.throwIfAborted(signal);
    const encodedQuery = encodeURIComponent(query);
    const searchUrls: Record<string, string> = {
      google: `https://www.google.com/search?q=${encodedQuery}&udm=14`,
      duckduckgo: `https://duckduckgo.com/?q=${encodedQuery}`,
      bing: `https://www.bing.com/search?q=${encodedQuery}`,
    };
    const url = searchUrls[engine.toLowerCase()];
    if (!url) throw new Error(`Unsupported search engine: ${engine}. Use: google, duckduckgo, bing`);

    return this.navigate(url, signal);
  }

  // ── Page content extraction (for extract tool) ─────────────

  async extractPageContent(signal?: AbortSignal, selector?: string): Promise<string> {
    this.throwIfAborted(signal);
    const session = await this.getPageSession();

    const selectorJs = selector ? JSON.stringify(selector) : 'null';

    // Extract clean text content from the page, converting to a readable format
    const result = await this.evalInPage(session, `
      (() => {
        const sel = ${selectorJs};
        const root = sel ? document.querySelector(sel) : document.body;
        if (!root) return '[No element matching selector: ' + sel + ']';

        function walk(el) {
          if (!el) return '';
          if (el.nodeType === 3) return el.textContent || '';
          if (el.nodeType !== 1) return '';
          const tag = el.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'template', 'meta', 'link', 'head', 'svg'].includes(tag)) return '';
          if (el.getAttribute('aria-hidden') === 'true') return '';
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return '';

          let text = '';
          for (const child of el.childNodes) {
            text += walk(child);
          }

          // Add structural formatting
          if (['h1','h2','h3','h4','h5','h6'].includes(tag)) {
            const level = tag[1];
            text = '\\n' + '#'.repeat(Number(level)) + ' ' + text.trim() + '\\n';
          } else if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
            text = '\\n' + text;
          } else if (tag === 'li') {
            text = '\\n- ' + text.trim();
          } else if (tag === 'br') {
            text = '\\n';
          } else if (tag === 'a' && el.href) {
            text = text.trim() + ' (' + el.href + ')';
          } else if (tag === 'img' && el.alt) {
            text = '[Image: ' + el.alt + ']';
          } else if (tag === 'table') {
            text = '\\n[Table]\\n' + text;
          } else if (tag === 'tr') {
            text = text.trim() + '\\n';
          } else if (tag === 'td' || tag === 'th') {
            text = text.trim() + ' | ';
          }

          return text;
        }

        const raw = walk(root);
        // Clean up excessive whitespace
        return raw.replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 100000);
      })()
    `);

    return typeof result === 'string' ? result : '[Could not extract page content]';
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

      // Attach per-page watchdogs
      this.popupWatchdog.attach(session);
      this.storageStateManager.configure({ session });

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

    // If active target was destroyed (e.g. tab crashed/closed), recover
    if (!this.activeTargetId) {
      log.info('No active target, recovering by finding or creating a page');
      const tabs = await this.listTabs();
      const page = tabs.find((t) => t.type === 'page');
      if (page) {
        this.activeTargetId = page.id;
      } else {
        const newTab = await this.newTab();
        this.activeTargetId = newTab.id;
      }
    }

    return this.ensurePageSession();
  }

  private cleanupStaleState(): void {
    this.popupWatchdog.detachAll();
    this.downloadWatchdog.detach();
    this.sessionHealthWatchdog.detach();
    this.storageStateManager.detach();

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

  private async waitForLoad(session: CDPClient, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Browser action aborted', 'AbortError'));
        return;
      }

      let resolved = false;
      let loadFired = false;
      let domContentLoadedFired = false;
      let pendingRequests = 0;
      let networkIdleTimer: ReturnType<typeof setTimeout> | null = null;

      const NETWORK_IDLE_MS = 300;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(hardTimeout);
        if (networkIdleTimer) clearTimeout(networkIdleTimer);
        signal?.removeEventListener('abort', onAbort);
        session.off('Page.loadEventFired', onLoad);
        session.off('Page.domContentEventFired', onDomContentLoaded);
        session.off('Network.requestWillBeSent', onRequestStart);
        session.off('Network.loadingFinished', onRequestEnd);
        session.off('Network.loadingFailed', onRequestEnd);
        resolve();
      };

      const onAbort = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(hardTimeout);
        if (networkIdleTimer) clearTimeout(networkIdleTimer);
        session.off('Page.loadEventFired', onLoad);
        session.off('Page.domContentEventFired', onDomContentLoaded);
        session.off('Network.requestWillBeSent', onRequestStart);
        session.off('Network.loadingFinished', onRequestEnd);
        session.off('Network.loadingFailed', onRequestEnd);
        reject(new DOMException('Browser action aborted', 'AbortError'));
      };

      const tryNetworkIdle = () => {
        // Only settle via network idle after DOMContentLoaded at minimum
        if (!domContentLoadedFired) return;
        if (networkIdleTimer) clearTimeout(networkIdleTimer);
        if (pendingRequests <= 0) {
          networkIdleTimer = setTimeout(finish, NETWORK_IDLE_MS);
        }
      };

      const onDomContentLoaded = () => {
        domContentLoadedFired = true;
        tryNetworkIdle();
      };

      const onLoad = () => {
        loadFired = true;
        // If load fires and network is quiet, finish quickly
        if (pendingRequests <= 0) {
          finish();
        } else {
          tryNetworkIdle();
        }
      };

      const onRequestStart = () => {
        pendingRequests++;
        if (networkIdleTimer) {
          clearTimeout(networkIdleTimer);
          networkIdleTimer = null;
        }
      };

      const onRequestEnd = () => {
        pendingRequests = Math.max(0, pendingRequests - 1);
        if (loadFired || domContentLoadedFired) {
          tryNetworkIdle();
        }
      };

      const hardTimeout = setTimeout(finish, LOAD_TIMEOUT_MS);

      signal?.addEventListener('abort', onAbort, { once: true });
      session.on('Page.domContentEventFired', onDomContentLoaded);
      session.on('Page.loadEventFired', onLoad);
      session.on('Network.requestWillBeSent', onRequestStart);
      session.on('Network.loadingFinished', onRequestEnd);
      session.on('Network.loadingFailed', onRequestEnd);
    });
  }

  private async settle(ms?: number, signal?: AbortSignal): Promise<void> {
    await this.abortableSleep(ms ?? SETTLE_MS, signal);
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

// ── search_page / find_elements JS builders ────────────────

function escapeJsString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function buildSearchPageScript(options: {
  pattern: string;
  regex?: boolean;
  caseSensitive?: boolean;
  contextChars?: number;
  cssScope?: string;
  maxResults?: number;
}): string {
  const pattern = escapeJsString(options.pattern);
  const regex = options.regex ?? false;
  const caseSensitive = options.caseSensitive ?? false;
  const contextChars = options.contextChars ?? 60;
  const cssScope = options.cssScope ? escapeJsString(options.cssScope) : '';
  const maxResults = options.maxResults ?? 20;

  return `
    (() => {
      try {
        const root = ${cssScope ? `document.querySelector('${cssScope}') || document.body` : 'document.body'};
        const text = root.innerText || '';
        const flags = ${caseSensitive ? "'g'" : "'gi'"};
        let re;
        try {
          re = ${regex ? `new RegExp('${pattern}', flags)` : `new RegExp('${pattern}'.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), flags)`};
        } catch(e) {
          return {error: 'Invalid pattern: ' + e.message, matches: [], total: 0};
        }
        const matches = [];
        let m;
        let count = 0;
        while ((m = re.exec(text)) !== null) {
          count++;
          if (matches.length < ${maxResults}) {
            const start = Math.max(0, m.index - ${contextChars});
            const end = Math.min(text.length, m.index + m[0].length + ${contextChars});
            matches.push({
              match: m[0],
              context: text.slice(start, end),
              index: m.index,
            });
          }
          if (count > 10000) break;
        }
        return {matches, total: count};
      } catch(e) {
        return {error: 'search_page error: ' + e.message, matches: [], total: 0};
      }
    })()
  `;
}

function buildFindElementsScript(options: {
  selector: string;
  attributes?: string[];
  maxResults?: number;
  includeText?: boolean;
}): string {
  const selector = escapeJsString(options.selector);
  const attrs = JSON.stringify(options.attributes ?? []);
  const maxResults = options.maxResults ?? 20;
  const includeText = options.includeText ?? true;

  return `
    (() => {
      try {
        const els = document.querySelectorAll('${selector}');
        const total = els.length;
        const elements = [];
        const max = Math.min(total, ${maxResults});
        const wantAttrs = ${attrs};
        for (let i = 0; i < max; i++) {
          const el = els[i];
          const entry = {tag: el.tagName.toLowerCase()};
          if (${includeText}) {
            const t = el.textContent || '';
            entry.text = t.length > 200 ? t.slice(0, 200) + '...' : t.trim();
          }
          if (wantAttrs.length > 0) {
            const a = {};
            for (const attr of wantAttrs) {
              const v = el.getAttribute(attr);
              if (v !== null) a[attr] = v;
            }
            entry.attributes = a;
          } else {
            const a = {};
            for (const attr of el.attributes) {
              if (attr.name !== 'data-stitch-ref') a[attr.name] = attr.value;
            }
            entry.attributes = a;
          }
          elements.push(entry);
        }
        return {elements, total};
      } catch(e) {
        return {error: 'find_elements error: ' + e.message, elements: [], total: 0};
      }
    })()
  `;
}

// ── Singleton ───────────────────────────────────────────────

let instance: BrowserManager | null = null;

export function getBrowserManager(): BrowserManager {
  if (!instance) {
    instance = new BrowserManager();
  }
  return instance;
}
