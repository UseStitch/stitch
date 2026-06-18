import { tool } from 'ai';
import { z } from 'zod';

import { getBrowserManager } from '@/lib/browser/browser-manager.js';
import { BROWSER_TOOL_INSTRUCTIONS } from '@/lib/browser/tool-config.js';
import type {
  BrowserTab,
  DropdownOptionsResult,
  ExtractContentResult,
  FindElementsResult,
  ScrollDirection,
  SearchPageResult,
} from '@/lib/browser/types.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import { TOOLSET_SUMMARY_CONTEXT, summarizeTools, type Toolset } from '@/tools/toolsets/types.js';

const descriptionField = z
  .string()
  .describe('Short description of the task this browser action is performing. Shown to the user.');

const timeoutField = z.number().optional().describe('Action timeout in milliseconds.');

const outputSchemaField = z
  .record(z.string(), z.unknown())
  .optional()
  .describe('Optional JSON Schema object. Supported properties are returned in a data object.');

const browserSnapshotInputSchema = z.object({
  description: descriptionField,
});

const browserNavigateInputSchema = z.object({
  description: descriptionField,
  action: z
    .enum([
      'navigate',
      'search',
      'go_back',
      'go_forward',
      'tab_new',
      'tab_list',
      'tab_focus',
      'tab_close',
    ])
    .describe('Navigation action to perform.'),
  url: z.string().optional().describe('URL for navigate or tab_new actions.'),
  query: z.string().optional().describe('Search query for search action.'),
  engine: z.string().optional().describe('Search engine: google, duckduckgo, bing.'),
  tabId: z.string().optional().describe('Tab ID for tab_focus or tab_close actions.'),
  timeoutMs: timeoutField,
});

const browserInteractInputSchema = z.object({
  description: descriptionField,
  action: z
    .enum([
      'click',
      'type',
      'press',
      'hover',
      'select',
      'get_dropdown_options',
      'select_dropdown',
      'scroll',
      'resize',
      'evaluate',
    ])
    .describe('Interaction action to perform.'),
  ref: z
    .string()
    .optional()
    .describe(
      'Element ref from a snapshot (e.g. "e1", "e2"). Required for click/type/hover/select/dropdown actions.',
    ),
  text: z.string().optional().describe('Text to type, or dropdown option text to select.'),
  key: z
    .string()
    .optional()
    .describe('Key to press (e.g. Enter, Tab, Escape). Required for press action.'),
  values: z.array(z.string()).optional().describe('Option values for select action.'),
  submit: z.boolean().optional().describe('Press Enter after typing. For type action.'),
  slowly: z.boolean().optional().describe('Type character by character. For type action.'),
  clear: z.boolean().optional().describe('Clear the field before typing. For type action.'),
  doubleClick: z
    .boolean()
    .optional()
    .describe('Double-click instead of single click. For click action.'),
  button: z.string().optional().describe('Mouse button: left, right, or middle. For click action.'),
  modifiers: z.array(z.string()).optional().describe('Keyboard modifiers for click action.'),
  direction: z
    .enum(['up', 'down', 'left', 'right'])
    .optional()
    .describe('Direction to scroll. Required for scroll action.'),
  width: z.number().optional().describe('Viewport width in pixels. Required for resize action.'),
  height: z.number().optional().describe('Viewport height in pixels. Required for resize action.'),
  fn: z
    .string()
    .optional()
    .describe('JavaScript expression to evaluate. Required for evaluate action.'),
  timeoutMs: timeoutField,
});

const browserWaitInputSchema = z.object({
  description: descriptionField,
  mode: z
    .enum(['time', 'selector'])
    .describe('Wait mode. Use time for timed waits and selector for CSS selector waits.'),
  timeMs: z.number().optional().describe('Time to wait in milliseconds. Required for time mode.'),
  selector: z.string().optional().describe('CSS selector to wait for. Required for selector mode.'),
  timeoutMs: timeoutField,
});

const browserScreenshotInputSchema = z.object({
  description: descriptionField,
  ref: z.string().optional().describe('Element ref for element screenshot.'),
  format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Screenshot format. Default png.'),
  quality: z.number().optional().describe('Screenshot quality 0-100 for jpeg/webp.'),
  fullPage: z.boolean().optional().describe('Capture full page screenshot.'),
});

const browserDialogInputSchema = z.object({
  description: descriptionField,
  action: z.enum(['state', 'handle']).describe('Dialog action to perform.'),
  dialogAction: z
    .enum(['accept', 'dismiss'])
    .optional()
    .describe('Whether to accept or dismiss a dialog.'),
  promptText: z.string().optional().describe('Optional prompt text when accepting prompt dialogs.'),
});

const browserContentInputSchema = z.object({
  description: descriptionField,
  action: z
    .enum(['extract', 'search_page', 'find_elements'])
    .describe('Content action to perform.'),
  query: z.string().optional().describe('Extraction query for extract action.'),
  selector: z.string().optional().describe('CSS selector for extract or find_elements actions.'),
  pattern: z
    .string()
    .optional()
    .describe('Text pattern to search for. Required for search_page action.'),
  regex: z.boolean().optional().describe('Treat pattern as regex for search_page action.'),
  caseSensitive: z.boolean().optional().describe('Case-sensitive search for search_page action.'),
  contextChars: z
    .number()
    .optional()
    .describe('Context characters per match for search_page action.'),
  cssScope: z
    .string()
    .optional()
    .describe('CSS selector to scope text search within for search_page action.'),
  maxResults: z
    .number()
    .optional()
    .describe('Max results for search_page or find_elements actions.'),
  attributes: z
    .array(z.string())
    .optional()
    .describe('Attributes to extract for find_elements action.'),
  includeText: z
    .boolean()
    .optional()
    .describe('Include text content for find_elements action. Default true.'),
  includeLinks: z.boolean().optional().describe('Include links for extract action.'),
  includeImages: z.boolean().optional().describe('Include images for extract action.'),
  outputSchema: outputSchemaField,
});

const browserBatchActionSchema = z.object({
  tool: z
    .enum(['snapshot', 'navigate', 'interact', 'wait', 'screenshot', 'dialog', 'content'])
    .describe('Tool group to execute for this batch action.'),
  op: z.string().optional().describe('Operation name within the selected tool group.'),
  url: z.string().optional().describe('URL for navigate/tab_new operations.'),
  query: z.string().optional().describe('Query for search or extract operations.'),
  engine: z.string().optional().describe('Search engine for search operation.'),
  tabId: z.string().optional().describe('Tab ID for tab_focus/tab_close operations.'),
  ref: z.string().optional().describe('Element ref from latest snapshot.'),
  text: z.string().optional().describe('Text for type operation.'),
  key: z.string().optional().describe('Key for press operation.'),
  values: z.array(z.string()).optional().describe('Values for select operation.'),
  submit: z.boolean().optional().describe('Submit after typing.'),
  slowly: z.boolean().optional().describe('Type character by character.'),
  clear: z.boolean().optional().describe('Clear field before typing.'),
  doubleClick: z.boolean().optional().describe('Double-click for click operation.'),
  button: z.string().optional().describe('Mouse button for click operation.'),
  modifiers: z.array(z.string()).optional().describe('Modifier keys for click operation.'),
  direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction.'),
  width: z.number().optional().describe('Width for resize operation.'),
  height: z.number().optional().describe('Height for resize operation.'),
  fn: z.string().optional().describe('Expression for evaluate operation.'),
  mode: z.enum(['time', 'selector']).optional().describe('Mode for wait tool.'),
  timeMs: z.number().optional().describe('Duration in ms for wait time mode.'),
  selector: z.string().optional().describe('CSS selector for wait/find/extract scope.'),
  timeoutMs: timeoutField,
  format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Screenshot format.'),
  quality: z.number().optional().describe('Screenshot quality for jpeg/webp.'),
  fullPage: z.boolean().optional().describe('Full-page screenshot mode.'),
  dialogAction: z.enum(['accept', 'dismiss']).optional().describe('Dialog handling action.'),
  promptText: z.string().optional().describe('Prompt text when accepting prompt dialogs.'),
  pattern: z.string().optional().describe('Pattern for search_page operation.'),
  regex: z.boolean().optional().describe('Regex mode for search_page operation.'),
  caseSensitive: z.boolean().optional().describe('Case-sensitive mode for search_page operation.'),
  contextChars: z.number().optional().describe('Context chars for search_page operation.'),
  cssScope: z.string().optional().describe('CSS scope for search_page operation.'),
  maxResults: z.number().optional().describe('Max results for search_page/find_elements.'),
  attributes: z.array(z.string()).optional().describe('Attributes to return for find_elements.'),
  includeText: z
    .boolean()
    .optional()
    .describe('Whether find_elements should include text content.'),
  includeLinks: z.boolean().optional().describe('Include links for extract operation.'),
  includeImages: z.boolean().optional().describe('Include images for extract operation.'),
  outputSchema: outputSchemaField,
});

const browserBatchInputSchema = z.object({
  description: descriptionField,
  actions: z
    .array(browserBatchActionSchema)
    .min(1)
    .max(5)
    .describe('Sequential actions to execute.'),
  stopOnPageChange: z
    .boolean()
    .optional()
    .default(true)
    .describe('Stop executing remaining actions if page state changes.'),
  stopOnError: z
    .boolean()
    .optional()
    .default(true)
    .describe('Stop executing remaining actions when an action fails.'),
});

const SNAPSHOT_DESCRIPTION = `Capture the current browser state as a fresh snapshot.

Use this before interactions to get current refs. The snapshot includes URL, tabs, scroll metadata, page stats, and a YAML accessibility tree with refs like [ref=e12], plus viewport/new markers.`;

const NAVIGATE_DESCRIPTION = `Run browser navigation and tab actions.

Actions:
- navigate: go to URL
- search: run web search directly
- go_back / go_forward: history navigation
- tab_new / tab_list / tab_focus / tab_close: tab management

Use timeoutMs for navigation-sensitive operations. Page-changing actions return an updated snapshot in the result.`;

const INTERACT_DESCRIPTION = `Interact with page elements and keyboard/mouse controls.

Actions:
- click / type / hover / select / scroll
- get_dropdown_options / select_dropdown for dropdown discovery and text selection
- press (keyboard)
- resize (viewport)
- evaluate (JavaScript, last resort)

Use refs from the latest snapshot for element-targeted actions. Navigation-capable interactions return an updated snapshot in the result.`;

const WAIT_DESCRIPTION = `Wait for page conditions.

Modes:
- time: wait a fixed duration using timeMs
- selector: wait for a CSS selector using selector

Use timeoutMs to cap the maximum wait.`;

const SCREENSHOT_DESCRIPTION = `Take a browser screenshot.

Supports viewport, full-page, and element screenshots (via ref). Returns base64 image data and format.`;

const DIALOG_DESCRIPTION = `Inspect and control browser dialogs (alert/confirm/prompt).

Actions:
- state: check if a dialog is open
- handle: accept or dismiss the open dialog`;

const CONTENT_DESCRIPTION = `Query or extract content from the current page.

Actions:
- extract: extract page content for a query
- extract: extract page text, optionally with links/images/schema-shaped data
- search_page: fast visible-text pattern search
- find_elements: query DOM elements by CSS selector`;

const BATCH_DESCRIPTION = `Execute up to 5 browser actions in one serialized call.

Use this for efficient, single-goal chains like type + type + click. Actions execute in order and stop early on error, sequence-terminating actions, or a lightweight DOM/page fingerprint change by default. Results are concise; if the batch changes page state, the result includes an updated snapshot.`;

let queueTail: Promise<void> = Promise.resolve();

async function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const previous = queueTail.catch(() => {});
  let release: () => void = () => {};
  queueTail = previous.then(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );

  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function runBrowserTool<TInput>(
  input: TInput,
  execContext: { toolCallId: string; abortSignal?: AbortSignal },
  sessionId: string,
  execute: (signal?: AbortSignal) => Promise<unknown>,
): Promise<unknown> {
  return runSerialized(async () => {
    try {
      const browser = getBrowserManager(sessionId);
      await browser.launch();
      return await execute(execContext.abortSignal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });
}

type BatchAction = z.infer<typeof browserBatchActionSchema>;

type OperationInput = BatchAction & {
  tool: 'snapshot' | 'navigate' | 'interact' | 'wait' | 'screenshot' | 'dialog' | 'content';
};

function getRequiredOp(action: BatchAction): string {
  if (!action.op) {
    throw new Error(`Missing required field: op for tool ${action.tool}`);
  }
  return action.op;
}

function actionTerminatesSequence(action: BatchAction, op: string): boolean {
  if (action.tool === 'navigate') {
    return op !== 'tab_list' && op !== 'tab_close';
  }
  if (action.tool === 'interact') {
    return op === 'evaluate';
  }
  return false;
}

function shouldReturnFreshSnapshot(input: OperationInput): boolean {
  if (input.tool === 'navigate') {
    const op = input.op;
    return op !== 'tab_list';
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

async function withFreshSnapshot(
  result: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const browser = getBrowserManager();
  const snapshot = await browser.snapshot(signal);
  const output =
    typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2);
  return {
    ...result,
    output: `${output}\n\n### Updated Snapshot\n${snapshot}`,
    snapshot,
  };
}

function formatTabsOutput(tabs: BrowserTab[]) {
  const tabList = tabs
    .filter((t) => t.type === 'page')
    .map((t) => `  ${t.id}: ${t.title || '(untitled)'} - ${t.url}`)
    .join('\n');
  return `Open tabs:\n${tabList}`;
}

function formatSearchPageSummary(pattern: string, result: SearchPageResult) {
  const matchLines = result.matches.map((m, i) => `  ${i + 1}. "${m.match}" - ...${m.context}...`);
  const showing = result.matches.length;
  const total = result.total;
  if (total === 0) {
    return `No matches for "${pattern}".`;
  }
  return `Found ${total} match${total !== 1 ? 'es' : ''} for "${pattern}"${showing < total ? ` (showing ${showing})` : ''}:\n${matchLines.join('\n')}`;
}

function formatFindElementsSummary(selector: string, result: FindElementsResult) {
  const elemLines = result.elements.map((el, i) => {
    let line = `  ${i + 1}. <${el.tag}>`;
    if (el.text) line += ` "${el.text}"`;
    if (el.attributes && Object.keys(el.attributes).length > 0) {
      const attrStr = Object.entries(el.attributes)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      line += ` [${attrStr}]`;
    }
    return line;
  });
  const showing = result.elements.length;
  const total = result.total;
  if (total === 0) {
    return `No elements matching "${selector}".`;
  }
  return `Found ${total} element${total !== 1 ? 's' : ''} matching "${selector}"${showing < total ? ` (showing ${showing})` : ''}:\n${elemLines.join('\n')}`;
}

function formatDropdownOptionsSummary(ref: string, result: DropdownOptionsResult) {
  if (result.options.length === 0) {
    return `No dropdown options found for ${ref}.`;
  }

  const lines = result.options.map((option) => {
    const selected = option.selected ? ' selected' : '';
    const disabled = option.disabled ? ' disabled' : '';
    return `  ${option.index}. "${option.text}" value="${option.value}"${selected}${disabled}`;
  });
  return `Dropdown options for ${ref} (${result.type}):\n${lines.join('\n')}\nUse browser_interact action="select_dropdown" with text to choose one.`;
}

function formatExtractContent(query: string | undefined, result: string | ExtractContentResult) {
  if (typeof result === 'string') {
    return `### Extracted Content\n**Query:** ${query ?? 'page content'}\n\n${result}`;
  }

  const sections = [
    `### Extracted Content`,
    `**Query:** ${query ?? 'page content'}`,
    '',
    result.text,
  ];
  if (result.links) {
    sections.push('', `### Links`, JSON.stringify(result.links, null, 2));
  }
  if (result.images) {
    sections.push('', `### Images`, JSON.stringify(result.images, null, 2));
  }
  if (result.data) {
    sections.push('', `### Data`, JSON.stringify(result.data, null, 2));
  }
  return sections.join('\n');
}

function summarizeOperationResult(result: unknown): string {
  if (!result || typeof result !== 'object' || !('output' in result)) {
    return summarizeValue(result);
  }

  return summarizeValue((result as { output: unknown }).output);
}

function summarizeValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function formatBatchActionLabel(index: number, action: BatchAction): string {
  return `${index}. ${action.tool}${action.op ? `.${action.op}` : ''}`;
}

async function executeOperation(input: OperationInput, signal?: AbortSignal): Promise<unknown> {
  const browser = getBrowserManager();

  if (input.tool === 'snapshot') {
    const tree = await browser.snapshot(signal);
    return { output: tree };
  }

  if (input.tool === 'navigate') {
    const op = getRequiredOp(input);
    switch (op) {
      case 'navigate': {
        if (!input.url) throw new Error('Missing required field: url');
        return { output: await browser.navigate(input.url, signal, input.timeoutMs) };
      }
      case 'search': {
        if (!input.query) throw new Error('Missing required field: query');
        return {
          output: await browser.search(
            input.query,
            input.engine ?? 'google',
            signal,
            input.timeoutMs,
          ),
        };
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
        if (!input.tabId) throw new Error('Missing required field: tabId');
        await browser.focusTab(input.tabId, { signal, timeoutMs: input.timeoutMs });
        return { output: `Focused tab: ${input.tabId}` };
      }
      case 'tab_close': {
        await browser.closeTab(input.tabId, signal);
        return { output: `Closed tab: ${input.tabId ?? 'active'}` };
      }
      default:
        throw new Error(`Invalid op for navigate tool: ${op}`);
    }
  }

  if (input.tool === 'interact') {
    const op = getRequiredOp(input);
    switch (op) {
      case 'click': {
        if (!input.ref) throw new Error('Missing required field: ref');
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
        if (!input.ref) throw new Error('Missing required field: ref');
        if (!input.text) throw new Error('Missing required field: text');
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
        if (!input.key) throw new Error('Missing required field: key');
        return { output: await browser.press(input.key, signal, input.timeoutMs) };
      }
      case 'hover': {
        if (!input.ref) throw new Error('Missing required field: ref');
        return { output: await browser.hover(input.ref, signal) };
      }
      case 'select': {
        if (!input.ref) throw new Error('Missing required field: ref');
        if (!input.values) throw new Error('Missing required field: values');
        return { output: await browser.select(input.ref, input.values, signal) };
      }
      case 'get_dropdown_options': {
        if (!input.ref) throw new Error('Missing required field: ref');
        const result = await browser.getDropdownOptions(input.ref, signal);
        return { output: formatDropdownOptionsSummary(input.ref, result), options: result.options };
      }
      case 'select_dropdown': {
        if (!input.ref) throw new Error('Missing required field: ref');
        if (!input.text) throw new Error('Missing required field: text');
        return {
          output: await browser.selectDropdown(input.ref, input.text, signal, input.timeoutMs),
        };
      }
      case 'scroll': {
        if (!input.direction) throw new Error('Missing required field: direction');
        return {
          output: await browser.scroll(input.ref, input.direction as ScrollDirection, signal),
        };
      }
      case 'resize': {
        if (!input.width) throw new Error('Missing required field: width');
        if (!input.height) throw new Error('Missing required field: height');
        return { output: await browser.resize(input.width, input.height, signal) };
      }
      case 'evaluate': {
        if (!input.fn) throw new Error('Missing required field: fn');
        const result = await browser.evaluate(input.fn, signal);
        return {
          output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        };
      }
      default:
        throw new Error(`Invalid op for interact tool: ${op}`);
    }
  }

  if (input.tool === 'wait') {
    const mode = input.mode ?? input.op ?? 'time';
    if (mode === 'time') {
      if (input.timeMs === undefined) throw new Error('Missing required field: timeMs');
      return { output: await browser.wait(input.timeMs, undefined, signal) };
    }
    if (!input.selector) throw new Error('Missing required field: selector');
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
    return {
      output: `Screenshot taken (${result.format})`,
      data: result.data,
      format: result.format,
    };
  }

  if (input.tool === 'dialog') {
    const op = getRequiredOp(input);
    if (op === 'state') {
      const state = await browser.getDialogState(signal);
      if (!state.open) {
        return { output: 'No open dialog found.' };
      }
      const message = state.message ? `\nMessage: ${state.message}` : '';
      return { output: `Dialog is open (${state.type ?? 'unknown'})${message}` };
    }
    if (op === 'handle') {
      if (!input.dialogAction) throw new Error('Missing required field: dialogAction');
      return { output: await browser.handleDialog(input.dialogAction, input.promptText, signal) };
    }
    throw new Error(`Invalid op for dialog tool: ${op}`);
  }

  if (input.tool === 'content') {
    const op = getRequiredOp(input);
    switch (op) {
      case 'extract': {
        const content = await browser.extractPageContent(signal, {
          selector: input.selector,
          includeLinks: input.includeLinks,
          includeImages: input.includeImages,
          outputSchema: input.outputSchema,
        });
        const selectorNote = input.selector ? `\n**Selector:** ${input.selector}` : '';
        return {
          output: `${formatExtractContent(input.query, content)}${selectorNote}`,
        };
      }
      case 'search_page': {
        if (!input.pattern) throw new Error('Missing required field: pattern');
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
        if (!input.selector) throw new Error('Missing required field: selector');
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
        throw new Error(`Invalid op for content tool: ${op}`);
    }
  }

  throw new Error('Unsupported batch tool.');
}

function createSnapshotTool(context: ToolContext) {
  return createBrowserTool(
    context,
    SNAPSHOT_DESCRIPTION,
    browserSnapshotInputSchema,
    (input, signal) => {
      return executeOperation({ ...input, tool: 'snapshot' }, signal);
    },
  );
}

function createBrowserTool<TInput>(
  context: ToolContext,
  description: string,
  inputSchema: z.ZodType<TInput>,
  executeAction: (input: TInput, signal?: AbortSignal) => Promise<unknown>,
) {
  return tool({
    description,
    inputSchema,
    execute: async (input, execContext) => {
      return runBrowserTool(input, execContext, context.sessionId, (signal) =>
        executeAction(input, signal),
      );
    },
  });
}

function createNavigateTool(context: ToolContext) {
  return createBrowserTool(
    context,
    NAVIGATE_DESCRIPTION,
    browserNavigateInputSchema,
    async (input, signal) => {
      const operation = { ...input, tool: 'navigate' as const, op: input.action };
      const result = await executeOperation(operation, signal);
      if (!shouldReturnFreshSnapshot(operation)) return result;
      return withFreshSnapshot(result as Record<string, unknown>, signal);
    },
  );
}

function createInteractTool(context: ToolContext) {
  return createBrowserTool(
    context,
    INTERACT_DESCRIPTION,
    browserInteractInputSchema,
    async (input, signal) => {
      const operation = { ...input, tool: 'interact' as const, op: input.action };
      const result = await executeOperation(operation, signal);
      if (!shouldReturnFreshSnapshot(operation)) return result;
      return withFreshSnapshot(result as Record<string, unknown>, signal);
    },
  );
}

function createWaitTool(context: ToolContext) {
  return createBrowserTool(context, WAIT_DESCRIPTION, browserWaitInputSchema, (input, signal) => {
    return executeOperation({ ...input, tool: 'wait', op: input.mode }, signal);
  });
}

function createScreenshotTool(context: ToolContext) {
  return createBrowserTool(
    context,
    SCREENSHOT_DESCRIPTION,
    browserScreenshotInputSchema,
    (input, signal) => {
      return executeOperation({ ...input, tool: 'screenshot', op: 'capture' }, signal);
    },
  );
}

function createDialogTool(context: ToolContext) {
  return createBrowserTool(
    context,
    DIALOG_DESCRIPTION,
    browserDialogInputSchema,
    (input, signal) => {
      return executeOperation({ ...input, tool: 'dialog', op: input.action }, signal);
    },
  );
}

function createContentTool(context: ToolContext) {
  return createBrowserTool(
    context,
    CONTENT_DESCRIPTION,
    browserContentInputSchema,
    (input, signal) => {
      return executeOperation({ ...input, tool: 'content', op: input.action }, signal);
    },
  );
}

function createBatchTool(context: ToolContext) {
  return tool({
    description: BATCH_DESCRIPTION,
    inputSchema: browserBatchInputSchema,
    execute: async (input, execContext) => {
      return runBrowserTool(input, execContext, context.sessionId, async (signal) => {
        const browser = getBrowserManager();
        const results: Array<{
          index: number;
          tool: string;
          op?: string;
          status: 'ok' | 'error';
          output?: string;
          error?: string;
        }> = [];

        let stoppedReason: string | null = null;
        let freshSnapshot: string | null = null;
        let lastSuccessfulAction: OperationInput | null = null;

        for (let i = 0; i < input.actions.length; i++) {
          const action = input.actions[i];
          const op = action.op;

          let beforeState: string | null = null;
          try {
            beforeState = await browser.getExecutionState(signal);
          } catch {
            beforeState = null;
          }

          try {
            const result = await executeOperation(action, signal);
            const resultRecord: {
              index: number;
              tool: string;
              op?: string;
              status: 'ok';
              output: string;
            } = {
              index: i + 1,
              tool: action.tool,
              status: 'ok',
              output: summarizeOperationResult(result),
            };
            if (op) {
              resultRecord.op = op;
            }
            results.push(resultRecord);
            lastSuccessfulAction = action;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const errorRecord: {
              index: number;
              tool: string;
              op?: string;
              status: 'error';
              error: string;
            } = {
              index: i + 1,
              tool: action.tool,
              status: 'error',
              error: message,
            };
            if (op) {
              errorRecord.op = op;
            }
            results.push(errorRecord);

            if (input.stopOnError) {
              stoppedReason = `Stopped on error at action ${i + 1}: ${message}`;
              break;
            }
            continue;
          }

          if (i >= input.actions.length - 1) {
            continue;
          }

          if (op && actionTerminatesSequence(action, op)) {
            stoppedReason = `Stopped after ${action.tool}.${op}: terminates sequence.`;
            freshSnapshot = await browser.snapshot(signal);
            break;
          }

          if (input.stopOnPageChange) {
            let afterState: string | null = null;
            try {
              afterState = await browser.getExecutionState(signal);
            } catch {
              afterState = null;
            }

            if (beforeState && afterState && beforeState !== afterState) {
              stoppedReason = `Stopped after action ${i + 1}: page state changed.`;
              freshSnapshot = await browser.snapshot(signal);
              break;
            }
          }
        }

        if (
          !freshSnapshot &&
          lastSuccessfulAction &&
          shouldReturnFreshSnapshot(lastSuccessfulAction)
        ) {
          freshSnapshot = await browser.snapshot(signal);
        }

        const executed = results.length;
        const total = input.actions.length;
        const skipped = Math.max(total - executed, 0);
        const summaryText = stoppedReason
          ? `Batch executed ${executed}/${total} action(s). ${stoppedReason}`
          : `Batch executed ${executed}/${total} action(s) successfully.`;
        const resultLines = results.map((result) => {
          const action = input.actions[result.index - 1];
          const label = action
            ? formatBatchActionLabel(result.index, action)
            : `${result.index}. action`;
          if (result.status === 'error') return `${label}: error - ${result.error}`;
          return `${label}: ok${result.output ? ` - ${result.output}` : ''}`;
        });
        const outputText =
          resultLines.length > 0 ? `${summaryText}\n${resultLines.join('\n')}` : summaryText;
        const summary = freshSnapshot
          ? `${outputText}\n\n### Updated Snapshot\n${freshSnapshot}`
          : outputText;

        return {
          output: summary,
          results,
          stoppedReason,
          executed,
          skipped,
          snapshot: freshSnapshot ?? undefined,
        };
      });
    },
  });
}

function createBrowserTools(context: ToolContext) {
  return {
    browser_snapshot: createSnapshotTool(context),
    browser_navigate: createNavigateTool(context),
    browser_interact: createInteractTool(context),
    browser_wait: createWaitTool(context),
    browser_screenshot: createScreenshotTool(context),
    browser_dialog: createDialogTool(context),
    browser_content: createContentTool(context),
    browser_batch: createBatchTool(context),
  };
}

export function createBrowserToolset(): Toolset {
  return {
    id: 'browser',
    kind: 'native',
    name: 'Browser',
    description:
      'Control a Chrome browser: navigate pages, click elements, type text, take screenshots, and interact with web applications.',
    instructions: BROWSER_TOOL_INSTRUCTIONS,
    truncation: { maxLines: 800, maxBytes: 16 * 1024 },
    tools: () => summarizeTools(createBrowserTools(TOOLSET_SUMMARY_CONTEXT)),
    activate: async (context) => createBrowserTools(context),
  };
}
