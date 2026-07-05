import type {
  ElectronBrowserCommand,
  ElectronBrowserCommandResultValue,
  ElectronBrowserDialogState,
  ElectronBrowserDropdownOptionsResult,
  ElectronBrowserExecutionState,
  ElectronBrowserExtractContentResult,
  ElectronBrowserFindElementsResult,
  ElectronBrowserSearchPageResult,
  ElectronBrowserState,
} from '@stitch/shared/browser/electron';

import { clickRef, hoverRef, scroll, selectRef, typeIntoRef } from './input-actions.js';
import { waitForPageStability } from './page-stability.js';
import { buildGetDropdownOptionsScript, buildSelectDropdownScript } from './scripts/dropdown.injected.js';
import { buildExtractContentScript } from './scripts/extract-content.injected.js';
import { buildFindElementsScript } from './scripts/find-elements.injected.js';
import { buildSearchPageScript } from './scripts/search-page.injected.js';
import { DEFAULT_URL, normalizeUrl, searchUrl } from './url.js';

import type { RefResolver } from './ref-resolver.js';
import type { SessionStore } from './session-store.js';
import type { Rectangle, WebContents } from 'electron';

const LOAD_TIMEOUT_MS = 15_000;

type CommandContext = {
  browser: WebContents;
  store: SessionStore;
  refResolver: RefResolver;
  getBrowser: () => Promise<WebContents>;
  getState: () => ElectronBrowserState;
  getDialogState: () => ElectronBrowserDialogState;
  handleDialog: (action: 'accept' | 'dismiss', promptText?: string) => Promise<string>;
  snapshot: (browser: WebContents) => Promise<string>;
};

export async function executeBrowserCommand(
  ctx: CommandContext,
  command: ElectronBrowserCommand,
): Promise<ElectronBrowserCommandResultValue> {
  switch (command.action) {
    case 'navigate':
      await ctx.browser.loadURL(normalizeUrl(command.url));
      await waitForPageStability(ctx.browser, command.timeoutMs);
      return `Navigated to ${ctx.browser.getURL()}`;
    case 'search':
      await ctx.browser.loadURL(searchUrl(command.query, command.engine));
      await waitForPageStability(ctx.browser, command.timeoutMs);
      return `Searched for ${command.query}`;
    case 'goBack':
      if (ctx.browser.navigationHistory.canGoBack()) ctx.browser.navigationHistory.goBack();
      await waitForPageStability(ctx.browser, command.timeoutMs);
      return `Went back to ${ctx.browser.getURL()}`;
    case 'goForward':
      if (ctx.browser.navigationHistory.canGoForward()) ctx.browser.navigationHistory.goForward();
      await waitForPageStability(ctx.browser, command.timeoutMs);
      return `Went forward to ${ctx.browser.getURL()}`;
    case 'newTab': {
      const newUrl = normalizeUrl(command.url ?? DEFAULT_URL);
      ctx.store.createTab(newUrl);
      await ctx.browser.loadURL(newUrl);
      await waitForPageStability(ctx.browser, command.timeoutMs);
      ctx.store.debouncedPersist();
      return ctx.getState();
    }
    case 'listTabs':
      return ctx.getState().tabs;
    case 'focusTab': {
      const target = ctx.store.focusTab(command.tabId);
      if (!target) return ctx.getState();
      await ctx.browser.loadURL(normalizeUrl(target.url) || DEFAULT_URL);
      await waitForPageStability(ctx.browser, command.timeoutMs);
      return ctx.getState();
    }
    case 'closeTab': {
      const next = ctx.store.closeTab(command.tabId);
      if (next) {
        await ctx.browser.loadURL(normalizeUrl(next.url) || DEFAULT_URL);
        await waitForPageStability(ctx.browser);
      }
      return ctx.getState();
    }
    case 'snapshot':
      return ctx.snapshot(ctx.browser);
    case 'executionState':
      return getExecutionState(ctx.browser);
    case 'click':
      await clickRef(ctx.browser, ctx.refResolver, command.ref, command.doubleClick, command.button, command.modifiers);
      await waitForPageStability(ctx.browser, command.timeoutMs);
      return `Clicked ${command.ref}`;
    case 'hover':
      await hoverRef(ctx.browser, ctx.refResolver, command.ref);
      return `Hovered ${command.ref}`;
    case 'type':
      await typeIntoRef(
        ctx.browser,
        ctx.refResolver,
        command.ref,
        command.text,
        command.clear,
        command.submit,
        command.slowly,
      );
      await waitForPageStability(ctx.browser);
      return `Typed into ${command.ref}`;
    case 'press':
      ctx.browser.sendInputEvent({ type: 'keyDown', keyCode: command.key });
      ctx.browser.sendInputEvent({ type: 'keyUp', keyCode: command.key });
      await waitForPageStability(ctx.browser, command.timeoutMs);
      return `Pressed ${command.key}`;
    case 'select':
      await selectRef(ctx.browser, ctx.refResolver, command.ref, command.values);
      return `Selected ${command.values.join(', ')} in ${command.ref}`;
    case 'getDropdownOptions':
      return ctx.refResolver.runOnRef<ElectronBrowserDropdownOptionsResult>(command.ref, buildGetDropdownOptionsScript);
    case 'selectDropdown': {
      const result = await ctx.refResolver.runOnRef<{ selected?: boolean; error?: string; text?: string }>(
        command.ref,
        (element) => buildSelectDropdownScript(element, command.text),
      );
      if (!result.selected) {
        throw new Error(result.error ?? `Dropdown option not found: ${command.text}`);
      }
      await waitForPageStability(ctx.browser, command.timeoutMs);
      return `Selected dropdown option "${result.text ?? command.text}" in ${command.ref}`;
    }
    case 'scroll':
      await scroll(ctx.getBrowser, ctx.refResolver, command.ref, command.direction);
      return `Scrolled ${command.direction}`;
    case 'screenshot': {
      const rect = await getScreenshotRect(ctx, command.ref, command.fullPage);
      const image = rect ? await ctx.browser.capturePage(rect) : await ctx.browser.capturePage();
      const format = command.format ?? 'png';
      return {
        data:
          format === 'png' ? image.toPNG().toString('base64') : image.toJPEG(command.quality ?? 90).toString('base64'),
        format,
      };
    }
    case 'evaluate':
      return ctx.browser.executeJavaScript(command.expression, true);
    case 'wait':
      await wait(ctx.getBrowser, command.timeMs, command.selector, command.timeoutMs);
      return command.selector ? `Selector appeared: ${command.selector}` : `Waited ${command.timeMs ?? 0}ms`;
    case 'extractPageContent':
      return runScript<string | ElectronBrowserExtractContentResult>(ctx.browser, buildExtractContentScript(command));
    case 'searchPage':
      return runScript<ElectronBrowserSearchPageResult>(ctx.browser, buildSearchPageScript(command));
    case 'findElements': {
      type RawFindResult = {
        elements: Array<{ tag: string; text?: string; attributes?: Record<string, string>; cssPath?: string }>;
        total: number;
      };
      const raw = await runScript<RawFindResult>(ctx.browser, buildFindElementsScript(command));
      const result: ElectronBrowserFindElementsResult = {
        total: raw.total,
        elements: raw.elements.map((el) => {
          const ref = el.cssPath ? ctx.refResolver.findRefBySelector(el.cssPath) : undefined;
          return { tag: el.tag, text: el.text, attributes: { ...el.attributes, ...(ref ? { ref } : {}) } };
        }),
      };
      return result;
    }
    case 'dialogState':
      return ctx.getDialogState();
    case 'handleDialog':
      return ctx.handleDialog(command.dialogAction, command.promptText);
    case 'ensure':
    case 'state':
      return ctx.getState();
  }
}

async function runScript<T>(browser: WebContents, script: string): Promise<T> {
  // The injected scripts are untyped strings; this is the single boundary where
  // their results are trusted to match the declared shape.
  return (await browser.executeJavaScript(script, true)) as T;
}

async function getExecutionState(browser: WebContents): Promise<ElectronBrowserExecutionState> {
  return runScript<ElectronBrowserExecutionState>(
    browser,
    `(() => {
      function hash(value) {
        let h = 2166136261;
        for (let i = 0; i < value.length; i++) {
          h ^= value.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(16);
      }

      function visible(el) {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      }

      function elementLabel(el) {
        const rect = el.getBoundingClientRect();
        const text = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim().replace(/s+/g, ' ').slice(0, 80);
        return [el.tagName.toLowerCase(), el.getAttribute('role') || '', el.id || '', el.name || '', text, Math.round(rect.top), Math.round(rect.left)].join('|');
      }

      const selector = 'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="radio"],[onclick],[tabindex]';
      const interactive = Array.from(document.querySelectorAll(selector)).filter(visible).slice(0, 300).map(elementLabel);
      const active = document.activeElement;
      const focusedElement = active && active !== document.body ? elementLabel(active) : '';
      const bodyText = (document.body?.innerText || '').trim().replace(/s+/g, ' ').slice(0, 4000);

      return {
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        focusedElement,
        interactiveCount: interactive.length,
        interactiveHash: hash(interactive.join('\n')),
        bodyTextHash: hash(bodyText),
      };
    })()`,
  );
}

async function getScreenshotRect(
  ctx: CommandContext,
  ref?: string,
  fullPage?: boolean,
): Promise<Rectangle | undefined> {
  if (ref) {
    const bounds = await ctx.refResolver.resolveRefBounds(ref);
    return {
      x: Math.max(0, Math.round(bounds.x - bounds.width / 2)),
      y: Math.max(0, Math.round(bounds.y - bounds.height / 2)),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
    };
  }

  if (!fullPage) return undefined;

  return (await ctx.browser.executeJavaScript(
    `(() => ({
      x: 0,
      y: 0,
      width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, window.innerWidth),
      height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight),
    }))()`,
    true,
  )) as Rectangle;
}

async function wait(
  getBrowser: () => Promise<WebContents>,
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
      await getBrowser()
    ).executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, true);
    if (found) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}
