import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { sendBrowserCommand } from '@/lib/browser/browser-manager.js';
import type { ScrollDirection } from '@/lib/browser/types.js';
import { BrowserInvalidOpError, BrowserMissingFieldError } from '@/tools/toolsets/browser/errors.js';
import {
  formatDropdownOptionsSummary,
  formatExtractContent,
  formatFindElementsSummary,
  formatSearchPageSummary,
  formatTabsOutput,
  snapshotFields,
} from '@/tools/toolsets/browser/formatters.js';
import type { BatchAction, OperationInput } from '@/tools/toolsets/browser/schemas.js';
import { serializeBrowserSnapshot } from '@/tools/toolsets/browser/snapshot-serializer.js';

function getRequiredOp(action: BatchAction): string {
  if (!action.op) {
    throw new BrowserMissingFieldError(action.tool, 'op');
  }
  return action.op;
}

export function actionTerminatesSequence(action: BatchAction, op: string): boolean {
  if (action.tool === 'navigate') {
    return op !== 'tab_list' && op !== 'tab_close';
  }
  if (action.tool === 'interact') {
    return op === 'evaluate';
  }
  return false;
}

export function shouldReturnFreshSnapshot(input: OperationInput): boolean {
  if (input.tool === 'navigate') {
    return input.op !== 'tab_list';
  }

  if (input.tool === 'interact') {
    return (
      input.op === 'click' ||
      input.op === 'press' ||
      input.op === 'select_dropdown' ||
      input.op === 'evaluate' ||
      (input.op === 'type' && input.submit === true)
    );
  }

  return false;
}

export async function executeOperation(input: OperationInput, signal?: AbortSignal): Promise<unknown> {
  if (input.tool === 'snapshot') {
    const tree = await sendBrowserCommand({ action: 'snapshot' }, signal);
    const compactSnapshot = serializeBrowserSnapshot(tree);
    return { output: compactSnapshot.text, ...snapshotFields(compactSnapshot) };
  }

  if (input.tool === 'navigate') {
    const op = getRequiredOp(input);
    switch (op) {
      case 'navigate': {
        if (!input.url) throw new BrowserMissingFieldError('navigate', 'url');
        return {
          output: await sendBrowserCommand({ action: 'navigate', url: input.url, timeoutMs: input.timeoutMs }, signal),
        };
      }
      case 'search': {
        if (!input.query) throw new BrowserMissingFieldError('navigate', 'query');
        return {
          output: await sendBrowserCommand(
            { action: 'search', query: input.query, engine: input.engine ?? 'google', timeoutMs: input.timeoutMs },
            signal,
          ),
        };
      }
      case 'go_back': {
        return { output: await sendBrowserCommand({ action: 'goBack', timeoutMs: input.timeoutMs }, signal) };
      }
      case 'go_forward': {
        return { output: await sendBrowserCommand({ action: 'goForward', timeoutMs: input.timeoutMs }, signal) };
      }
      case 'tab_new': {
        const state = await sendBrowserCommand(
          { action: 'newTab', url: input.url, timeoutMs: input.timeoutMs },
          signal,
        );
        const tab = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];
        return { output: `Opened new tab: ${tab.id} (${tab.url})` };
      }
      case 'tab_list': {
        const tabs = await sendBrowserCommand({ action: 'listTabs' }, signal);
        return { output: formatTabsOutput(tabs) };
      }
      case 'tab_focus': {
        if (!input.tabId) throw new BrowserMissingFieldError('navigate', 'tabId');
        await sendBrowserCommand({ action: 'focusTab', tabId: input.tabId, timeoutMs: input.timeoutMs }, signal);
        return { output: `Focused tab: ${input.tabId}` };
      }
      case 'tab_close': {
        await sendBrowserCommand({ action: 'closeTab', tabId: input.tabId }, signal);
        return { output: `Closed tab: ${input.tabId ?? 'active'}` };
      }
      default:
        throw new BrowserInvalidOpError('navigate', op);
    }
  }

  if (input.tool === 'interact') {
    const op = getRequiredOp(input);
    switch (op) {
      case 'click': {
        if (!input.ref) throw new BrowserMissingFieldError('interact', 'ref');
        return {
          output: await sendBrowserCommand(
            {
              action: 'click',
              ref: input.ref,
              doubleClick: input.doubleClick,
              button: input.button,
              modifiers: input.modifiers,
              timeoutMs: input.timeoutMs,
            },
            signal,
          ),
        };
      }
      case 'type': {
        if (!input.ref) throw new BrowserMissingFieldError('interact', 'ref');
        if (!input.text) throw new BrowserMissingFieldError('interact', 'text');
        return {
          output: await sendBrowserCommand(
            {
              action: 'type',
              ref: input.ref,
              text: input.text,
              slowly: input.slowly,
              submit: input.submit,
              clear: input.clear,
            },
            signal,
          ),
        };
      }
      case 'press': {
        if (!input.key) throw new BrowserMissingFieldError('interact', 'key');
        return {
          output: await sendBrowserCommand({ action: 'press', key: input.key, timeoutMs: input.timeoutMs }, signal),
        };
      }
      case 'hover': {
        if (!input.ref) throw new BrowserMissingFieldError('interact', 'ref');
        return { output: await sendBrowserCommand({ action: 'hover', ref: input.ref }, signal) };
      }
      case 'select': {
        if (!input.ref) throw new BrowserMissingFieldError('interact', 'ref');
        if (!input.values) throw new BrowserMissingFieldError('interact', 'values');
        return { output: await sendBrowserCommand({ action: 'select', ref: input.ref, values: input.values }, signal) };
      }
      case 'get_dropdown_options': {
        if (!input.ref) throw new BrowserMissingFieldError('interact', 'ref');
        const result = await sendBrowserCommand({ action: 'getDropdownOptions', ref: input.ref }, signal);
        return { output: formatDropdownOptionsSummary(input.ref, result), options: result.options };
      }
      case 'select_dropdown': {
        if (!input.ref) throw new BrowserMissingFieldError('interact', 'ref');
        if (!input.text) throw new BrowserMissingFieldError('interact', 'text');
        return {
          output: await sendBrowserCommand(
            { action: 'selectDropdown', ref: input.ref, text: input.text, timeoutMs: input.timeoutMs },
            signal,
          ),
        };
      }
      case 'scroll': {
        if (!input.direction) throw new BrowserMissingFieldError('interact', 'direction');
        return {
          output: await sendBrowserCommand(
            { action: 'scroll', ref: input.ref, direction: input.direction as ScrollDirection },
            signal,
          ),
        };
      }
      case 'evaluate': {
        if (!input.fn) throw new BrowserMissingFieldError('interact', 'fn');
        const result = await sendBrowserCommand({ action: 'evaluate', expression: input.fn }, signal);
        return { output: typeof result === 'string' ? result : JSON.stringify(result, null, 2) };
      }
      default:
        throw new BrowserInvalidOpError('interact', op);
    }
  }

  if (input.tool === 'wait') {
    const mode = input.mode ?? input.op ?? 'time';
    if (mode === 'time') {
      if (input.timeMs === undefined) throw new BrowserMissingFieldError('wait', 'timeMs');
      return { output: await sendBrowserCommand({ action: 'wait', timeMs: input.timeMs }, signal) };
    }
    if (!input.selector) throw new BrowserMissingFieldError('wait', 'selector');
    return {
      output: await sendBrowserCommand(
        { action: 'wait', timeoutMs: input.timeoutMs, selector: input.selector },
        signal,
      ),
    };
  }

  if (input.tool === 'screenshot') {
    const result = await sendBrowserCommand(
      { action: 'screenshot', format: input.format, quality: input.quality, fullPage: input.fullPage, ref: input.ref },
      signal,
    );
    if (input.path) {
      const buffer = Buffer.from(result.data, 'base64');
      const dir = dirname(input.path);
      if (dir && dir !== '.') {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(input.path, buffer);
      return {
        output: `Screenshot taken (${result.format}) and saved to ${input.path}`,
        data: result.data,
        format: result.format,
        path: input.path,
      };
    }
    return { output: `Screenshot taken (${result.format})`, data: result.data, format: result.format };
  }

  if (input.tool === 'dialog') {
    const op = getRequiredOp(input);
    if (op === 'state') {
      const state = await sendBrowserCommand({ action: 'dialogState' }, signal);
      if (!state.type) {
        return { output: 'No open dialog found.' };
      }
      const status = state.open ? 'open' : 'recent';
      const message = state.message ? `\nMessage: ${state.message}` : '';
      const url = state.url ? `\nURL: ${state.url}` : '';
      const disposition = state.disposition ? `\nDisposition: ${state.disposition}` : '';
      const defaultPrompt = state.defaultPromptText ? `\nDefault prompt text: ${state.defaultPromptText}` : '';
      return { output: `Dialog/popup state: ${status} (${state.type})${message}${url}${disposition}${defaultPrompt}` };
    }
    if (op === 'handle') {
      if (!input.dialogAction) throw new BrowserMissingFieldError('dialog', 'dialogAction');
      return {
        output: await sendBrowserCommand(
          { action: 'handleDialog', dialogAction: input.dialogAction, promptText: input.promptText },
          signal,
        ),
      };
    }
    throw new BrowserInvalidOpError('dialog', op);
  }

  const op = getRequiredOp(input);
  switch (op) {
    case 'extract': {
      const content = await sendBrowserCommand(
        {
          action: 'extractPageContent',
          selector: input.selector,
          query: input.query,
          includeLinks: input.includeLinks,
          includeImages: input.includeImages,
          outputSchema: input.outputSchema,
        },
        signal,
      );
      const selectorNote = input.selector ? `\n**Selector:** ${input.selector}` : '';
      return { output: `${formatExtractContent(input.query, content)}${selectorNote}` };
    }
    case 'search_page': {
      if (!input.pattern) throw new BrowserMissingFieldError('content', 'pattern');
      const result = await sendBrowserCommand(
        {
          action: 'searchPage',
          pattern: input.pattern,
          regex: input.regex,
          caseSensitive: input.caseSensitive,
          contextChars: input.contextChars,
          cssScope: input.cssScope,
          maxResults: input.maxResults,
        },
        signal,
      );
      return { output: formatSearchPageSummary(input.pattern, result) };
    }
    case 'find_elements': {
      if (!input.selector) throw new BrowserMissingFieldError('content', 'selector');
      const result = await sendBrowserCommand(
        {
          action: 'findElements',
          selector: input.selector,
          attributes: input.attributes,
          maxResults: input.maxResults,
          includeText: input.includeText,
        },
        signal,
      );
      return { output: formatFindElementsSummary(input.selector, result) };
    }
    default:
      throw new BrowserInvalidOpError('content', op);
  }
}
