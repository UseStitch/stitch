import type { ElectronBrowserCommand, ElectronBrowserState } from '@stitch/shared/browser/electron';

import { clickRef, hoverRef, scroll, selectRef, typeIntoRef } from './input-actions.js';
import { waitForPageStability } from './page-stability.js';
import {
  buildGetDropdownOptionsScript,
  buildSelectDropdownScript,
} from './scripts/dropdown.injected.js';
import { buildExtractContentScript } from './scripts/extract-content.injected.js';
import { buildFindElementsScript } from './scripts/find-elements.injected.js';
import { buildSearchPageScript } from './scripts/search-page.injected.js';
import { DEFAULT_URL, normalizeUrl, searchUrl } from './url.js';

import type { RefResolver } from './ref-resolver.js';
import type { SessionStore } from './session-store.js';
import type { WebContents } from 'electron';

const LOAD_TIMEOUT_MS = 15_000;

type CommandContext = {
  browser: WebContents;
  store: SessionStore;
  refResolver: RefResolver;
  getBrowser: () => Promise<WebContents>;
  getState: () => ElectronBrowserState;
  snapshot: (browser: WebContents) => Promise<string>;
};

export async function executeBrowserCommand(
  ctx: CommandContext,
  command: ElectronBrowserCommand,
): Promise<unknown> {
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
    case 'click':
      await clickRef(
        ctx.browser,
        ctx.refResolver,
        command.ref,
        command.doubleClick,
        command.button,
      );
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
      return ctx.refResolver.runOnRef(command.ref, buildGetDropdownOptionsScript);
    case 'selectDropdown': {
      const result = (await ctx.refResolver.runOnRef(command.ref, (element) =>
        buildSelectDropdownScript(element, command.text),
      )) as { selected?: boolean; error?: string; text?: string };
      if (!result.selected) {
        throw new Error(result.error ?? `Dropdown option not found: ${command.text}`);
      }
      await waitForPageStability(ctx.browser, command.timeoutMs);
      return `Selected dropdown option "${result.text ?? command.text}" in ${command.ref}`;
    }
    case 'scroll':
      await scroll(ctx.getBrowser, ctx.refResolver, command.ref, command.direction);
      return `Scrolled ${command.direction}`;
    case 'resize':
      return `Resize requested: ${command.width}x${command.height}`;
    case 'screenshot': {
      const image = await ctx.browser.capturePage();
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
      return ctx.browser.executeJavaScript(command.expression, true);
    case 'wait':
      await wait(ctx.getBrowser, command.timeMs, command.selector, command.timeoutMs);
      return command.selector
        ? `Selector appeared: ${command.selector}`
        : `Waited ${command.timeMs ?? 0}ms`;
    case 'extractPageContent':
      return ctx.browser.executeJavaScript(buildExtractContentScript(command), true);
    case 'searchPage':
      return ctx.browser.executeJavaScript(buildSearchPageScript(command), true);
    case 'findElements':
      return ctx.browser.executeJavaScript(buildFindElementsScript(command), true);
    case 'dialogState':
      return { open: false };
    case 'handleDialog':
      return 'No dialog handling is required.';
    case 'ensure':
    case 'state':
      return ctx.getState();
  }
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
