import { getBrowserManager } from '@/lib/browser/browser-manager.js';
import type { ScrollDirection } from '@/lib/browser/types.js';
import { BrowserInvalidOpError, BrowserMissingFieldError, ToolError } from '@/tools/errors.js';
import {
  formatDropdownOptionsSummary,
  formatExtractContent,
  formatFindElementsSummary,
  formatSearchPageSummary,
  formatTabsOutput,
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
  const browser = getBrowserManager();

  if (input.tool === 'snapshot') {
    const tree = await browser.snapshot(signal);
    const compactSnapshot = serializeBrowserSnapshot(tree);
    return {
      output: compactSnapshot.text,
      snapshot: compactSnapshot.text,
      snapshotFingerprint: compactSnapshot.fingerprint,
      snapshotOriginalChars: compactSnapshot.originalChars,
      snapshotTruncated: compactSnapshot.truncated,
    };
  }

  if (input.tool === 'navigate') {
    const op = getRequiredOp(input);
    switch (op) {
      case 'navigate': {
        if (!input.url) throw new BrowserMissingFieldError('navigate', 'url');
        return { output: await browser.navigate(input.url, signal, input.timeoutMs) };
      }
      case 'search': {
        if (!input.query) throw new BrowserMissingFieldError('navigate', 'query');
        return { output: await browser.search(input.query, input.engine ?? 'google', signal, input.timeoutMs) };
      }
      case 'go_back': {
        return { output: await browser.goBack(signal, input.timeoutMs) };
      }
      case 'go_forward': {
        return { output: await browser.goForward(signal, input.timeoutMs) };
      }
      case 'tab_new': {
        const tab = await browser.newTab(input.url, { signal, timeoutMs: input.timeoutMs });
        return { output: `Opened new tab: ${tab.id} (${tab.url})` };
      }
      case 'tab_list': {
        const tabs = await browser.listTabs(signal);
        return { output: formatTabsOutput(tabs) };
      }
      case 'tab_focus': {
        if (!input.tabId) throw new BrowserMissingFieldError('navigate', 'tabId');
        await browser.focusTab(input.tabId, { signal, timeoutMs: input.timeoutMs });
        return { output: `Focused tab: ${input.tabId}` };
      }
      case 'tab_close': {
        await browser.closeTab(input.tabId, signal);
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
          output: await browser.click(input.ref, {
            doubleClick: input.doubleClick,
            button: input.button,
            modifiers: input.modifiers,
            signal,
            timeoutMs: input.timeoutMs,
          }),
        };
      }
      case 'type': {
        if (!input.ref) throw new BrowserMissingFieldError('interact', 'ref');
        if (!input.text) throw new BrowserMissingFieldError('interact', 'text');
        return {
          output: await browser.type(input.ref, input.text, {
            slowly: input.slowly,
            submit: input.submit,
            clear: input.clear,
            signal,
          }),
        };
      }
      case 'press': {
        if (!input.key) throw new BrowserMissingFieldError('interact', 'key');
        return { output: await browser.press(input.key, signal, input.timeoutMs) };
      }
      case 'hover': {
        if (!input.ref) throw new BrowserMissingFieldError('interact', 'ref');
        return { output: await browser.hover(input.ref, signal) };
      }
      case 'select': {
        if (!input.ref) throw new BrowserMissingFieldError('interact', 'ref');
        if (!input.values) throw new BrowserMissingFieldError('interact', 'values');
        return { output: await browser.select(input.ref, input.values, signal) };
      }
      case 'get_dropdown_options': {
        if (!input.ref) throw new BrowserMissingFieldError('interact', 'ref');
        const result = await browser.getDropdownOptions(input.ref, signal);
        return { output: formatDropdownOptionsSummary(input.ref, result), options: result.options };
      }
      case 'select_dropdown': {
        if (!input.ref) throw new BrowserMissingFieldError('interact', 'ref');
        if (!input.text) throw new BrowserMissingFieldError('interact', 'text');
        return { output: await browser.selectDropdown(input.ref, input.text, signal, input.timeoutMs) };
      }
      case 'scroll': {
        if (!input.direction) throw new BrowserMissingFieldError('interact', 'direction');
        return { output: await browser.scroll(input.ref, input.direction as ScrollDirection, signal) };
      }
      case 'evaluate': {
        if (!input.fn) throw new BrowserMissingFieldError('interact', 'fn');
        const result = await browser.evaluate(input.fn, signal);
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
      return { output: await browser.wait(input.timeMs, undefined, signal) };
    }
    if (!input.selector) throw new BrowserMissingFieldError('wait', 'selector');
    return { output: await browser.wait(input.timeoutMs, input.selector, signal) };
  }

  if (input.tool === 'screenshot') {
    const result = await browser.screenshot({
      signal,
      format: input.format,
      quality: input.quality,
      fullPage: input.fullPage,
      ref: input.ref,
    });
    return { output: `Screenshot taken (${result.format})`, data: result.data, format: result.format };
  }

  if (input.tool === 'dialog') {
    const op = getRequiredOp(input);
    if (op === 'state') {
      const state = await browser.getDialogState(signal);
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
      return { output: await browser.handleDialog(input.dialogAction, input.promptText, signal) };
    }
    throw new BrowserInvalidOpError('dialog', op);
  }

  if (input.tool === 'content') {
    const op = getRequiredOp(input);
    switch (op) {
      case 'extract': {
        const content = await browser.extractPageContent(signal, {
          selector: input.selector,
          query: input.query,
          includeLinks: input.includeLinks,
          includeImages: input.includeImages,
          outputSchema: input.outputSchema,
        });
        const selectorNote = input.selector ? `\n**Selector:** ${input.selector}` : '';
        return { output: `${formatExtractContent(input.query, content)}${selectorNote}` };
      }
      case 'search_page': {
        if (!input.pattern) throw new BrowserMissingFieldError('content', 'pattern');
        const result = await browser.searchPage(
          {
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
        const result = await browser.findElements(
          {
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

  throw new ToolError('Unsupported batch tool.');
}
