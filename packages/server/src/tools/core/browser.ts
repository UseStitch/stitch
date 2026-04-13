import { tool } from 'ai';
import { z } from 'zod';

import { getBrowserManager } from '@/lib/browser/browser-manager.js';
import { importChromeProfile, listChromeProfiles } from '@/lib/browser/chrome-profile-importer.js';
import type { BrowserTab, FindElementsResult, ScrollDirection, SearchPageResult } from '@/lib/browser/types.js';
import * as Log from '@/lib/log.js';
import { askQuestion } from '@/question/service.js';
import { listSettings, saveSetting } from '@/settings/service.js';
import { isServiceError } from '@/lib/service-result.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';
import { withTruncation } from '@/tools/runtime/wrappers.js';

const headlessField = z
  .boolean()
  .optional()
  .default(true)
  .describe(
    'Run the browser without a visible window. Defaults to true. Set to false only when you need to show the browser to the user.',
  );

const timeoutField = z.number().optional().describe('Action timeout in milliseconds.');

const browserSnapshotInputSchema = z.object({
  headless: headlessField,
});

const browserNavigateInputSchema = z.object({
  action: z
    .enum(['navigate', 'search', 'go_back', 'go_forward', 'tab_new', 'tab_list', 'tab_focus', 'tab_close'])
    .describe('Navigation action to perform.'),
  url: z.string().optional().describe('URL for navigate or tab_new actions.'),
  query: z.string().optional().describe('Search query for search action.'),
  engine: z.string().optional().describe('Search engine: google, duckduckgo, bing.'),
  tabId: z.string().optional().describe('Tab ID for tab_focus or tab_close actions.'),
  timeoutMs: timeoutField,
  headless: headlessField,
});

const browserInteractInputSchema = z.object({
  action: z
    .enum(['click', 'type', 'press', 'hover', 'select', 'scroll', 'resize', 'evaluate'])
    .describe('Interaction action to perform.'),
  ref: z
    .string()
    .optional()
    .describe('Element ref from a snapshot (e.g. "e1", "e2"). Required for click/type/hover/select.'),
  text: z.string().optional().describe('Text to type. Required for type action.'),
  key: z.string().optional().describe('Key to press (e.g. Enter, Tab, Escape). Required for press action.'),
  values: z.array(z.string()).optional().describe('Option values for select action.'),
  submit: z.boolean().optional().describe('Press Enter after typing. For type action.'),
  slowly: z.boolean().optional().describe('Type character by character. For type action.'),
  clear: z.boolean().optional().describe('Clear the field before typing. For type action.'),
  doubleClick: z.boolean().optional().describe('Double-click instead of single click. For click action.'),
  button: z.string().optional().describe('Mouse button: left, right, or middle. For click action.'),
  modifiers: z.array(z.string()).optional().describe('Keyboard modifiers for click action.'),
  direction: z
    .enum(['up', 'down', 'left', 'right'])
    .optional()
    .describe('Direction to scroll. Required for scroll action.'),
  width: z.number().optional().describe('Viewport width in pixels. Required for resize action.'),
  height: z.number().optional().describe('Viewport height in pixels. Required for resize action.'),
  fn: z.string().optional().describe('JavaScript expression to evaluate. Required for evaluate action.'),
  timeoutMs: timeoutField,
  headless: headlessField,
});

const browserWaitInputSchema = z.object({
  mode: z
    .enum(['time', 'selector'])
    .describe('Wait mode. Use time for timed waits and selector for CSS selector waits.'),
  timeMs: z.number().optional().describe('Time to wait in milliseconds. Required for time mode.'),
  selector: z.string().optional().describe('CSS selector to wait for. Required for selector mode.'),
  timeoutMs: timeoutField,
  headless: headlessField,
});

const browserScreenshotInputSchema = z.object({
  ref: z.string().optional().describe('Element ref for element screenshot.'),
  format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Screenshot format. Default png.'),
  quality: z.number().optional().describe('Screenshot quality 0-100 for jpeg/webp.'),
  fullPage: z.boolean().optional().describe('Capture full page screenshot.'),
  headless: headlessField,
});

const browserDialogInputSchema = z.object({
  action: z.enum(['state', 'handle']).describe('Dialog action to perform.'),
  dialogAction: z.enum(['accept', 'dismiss']).optional().describe('Whether to accept or dismiss a dialog.'),
  promptText: z.string().optional().describe('Optional prompt text when accepting prompt dialogs.'),
  headless: headlessField,
});

const browserContentInputSchema = z.object({
  action: z.enum(['extract', 'search_page', 'find_elements']).describe('Content action to perform.'),
  query: z.string().optional().describe('Extraction query for extract action.'),
  selector: z.string().optional().describe('CSS selector for extract or find_elements actions.'),
  pattern: z.string().optional().describe('Text pattern to search for. Required for search_page action.'),
  regex: z.boolean().optional().describe('Treat pattern as regex for search_page action.'),
  caseSensitive: z.boolean().optional().describe('Case-sensitive search for search_page action.'),
  contextChars: z.number().optional().describe('Context characters per match for search_page action.'),
  cssScope: z.string().optional().describe('CSS selector to scope text search within for search_page action.'),
  maxResults: z.number().optional().describe('Max results for search_page or find_elements actions.'),
  attributes: z.array(z.string()).optional().describe('Attributes to extract for find_elements action.'),
  includeText: z.boolean().optional().describe('Include text content for find_elements action. Default true.'),
  headless: headlessField,
});

const browserBatchActionSchema = z.object({
  tool: z
    .enum([
      'snapshot',
      'navigate',
      'interact',
      'wait',
      'screenshot',
      'dialog',
      'content',
    ])
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
  includeText: z.boolean().optional().describe('Whether find_elements should include text content.'),
});

const browserBatchInputSchema = z.object({
  actions: z.array(browserBatchActionSchema).min(1).max(5).describe('Sequential actions to execute.'),
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
  headless: headlessField,
});

const SNAPSHOT_DESCRIPTION = `Capture the current browser state as a fresh snapshot.

Use this before interactions to get current refs. The snapshot includes URL, tabs, scroll metadata, page stats, and a YAML accessibility tree with refs like [ref=e12].`;

const NAVIGATE_DESCRIPTION = `Run browser navigation and tab actions.

Actions:
- navigate: go to URL
- search: run web search directly
- go_back / go_forward: history navigation
- tab_new / tab_list / tab_focus / tab_close: tab management

Use timeoutMs for navigation-sensitive operations.`;

const INTERACT_DESCRIPTION = `Interact with page elements and keyboard/mouse controls.

Actions:
- click / type / hover / select / scroll
- press (keyboard)
- resize (viewport)
- evaluate (JavaScript, last resort)

Use refs from the latest snapshot for element-targeted actions.`;

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
- search_page: fast visible-text pattern search
- find_elements: query DOM elements by CSS selector`;

const BATCH_DESCRIPTION = `Execute up to 5 browser actions in one serialized call.

Use this for efficient, single-goal chains like type + type + click. Actions execute in order and stop early on error or page change by default.`;

const log = Log.create({ service: 'tools.browser' });

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

let hasPromptedImport = false;

async function maybePromptProfileImport(
  context: ToolContext,
  toolCallId: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  if (hasPromptedImport) return;

  const settingsResult = await listSettings();
  const imported = !isServiceError(settingsResult) && settingsResult.data['browser.profileImported'];
  if (imported) {
    hasPromptedImport = true;
    return;
  }

  const profiles = await listChromeProfiles();
  if (profiles.length === 0) {
    hasPromptedImport = true;
    return;
  }

  hasPromptedImport = true;

  const answers = await askQuestion({
    sessionId: context.sessionId,
    messageId: context.messageId,
    streamRunId: context.streamRunId,
    toolCallId,
    abortSignal,
    questions: [
      {
        question:
          'Would you like to import your Chrome profile? This lets the browser use your existing logins, cookies, and sessions.',
        header: 'Chrome Profile',
        options: [
          {
            label: 'Import Chrome profile',
            description: 'Copy your Chrome logins and cookies into the Stitch browser',
          },
          { label: 'Skip', description: 'Use a clean browser without existing logins' },
        ],
      },
    ],
  });

  const answer = answers[0]?.[0];
  if (!answer || answer === 'Skip') {
    await saveSetting('browser.profileImported', 'skipped');
    return;
  }

  let profileId: string;
  if (profiles.length === 1) {
    profileId = profiles[0].id;
  } else {
    const profileAnswers = await askQuestion({
      sessionId: context.sessionId,
      messageId: context.messageId,
      streamRunId: context.streamRunId,
      toolCallId,
      abortSignal,
      questions: [
        {
          question: 'Which Chrome profile would you like to import?',
          header: 'Select Profile',
          options: profiles.map((p) => ({
            label: p.name,
            description: p.email || p.id,
          })),
        },
      ],
    });

    const selectedName = profileAnswers[0]?.[0];
    const selected = profiles.find((p) => p.name === selectedName);
    profileId = selected?.id ?? profiles[0].id;
  }

  const profile = profiles.find((p) => p.id === profileId);
  const profileLabel = profile
    ? `${profile.name}${profile.email ? ` (${profile.email})` : ''}`
    : profileId;

  log.info({ profileId, profileLabel }, 'Importing Chrome profile from first-use prompt');
  await importChromeProfile(profileId);
  const timestamp = new Date().toISOString();
  await saveSetting('browser.profileImported', `${profileLabel} - ${timestamp}`);
  await saveSetting('browser.activeProfile', `chrome/${profileId}`);
}

async function runBrowserTool<TInput extends { headless?: boolean }>(
  context: ToolContext,
  input: TInput,
  execContext: { toolCallId: string; abortSignal?: AbortSignal },
  execute: (signal?: AbortSignal) => Promise<unknown>,
): Promise<unknown> {
  return runSerialized(async () => {
    try {
      await maybePromptProfileImport(context, execContext.toolCallId, execContext.abortSignal);
    } catch (error) {
      log.info(
        { error: error instanceof Error ? error.message : String(error) },
        'Profile import prompt skipped',
      );
    }

    try {
      const browser = getBrowserManager();
      await browser.launch({ headless: input.headless });
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

function formatFindElementsSummary(
  selector: string,
  result: FindElementsResult,
) {
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
          output: await browser.search(input.query, input.engine ?? 'google', signal, input.timeoutMs),
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
      case 'scroll': {
        if (!input.direction) throw new Error('Missing required field: direction');
        return { output: await browser.scroll(input.ref, input.direction as ScrollDirection, signal) };
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
        if (!input.query) throw new Error('Missing required field: query');
        const content = await browser.extractPageContent(signal, input.selector);
        const selectorNote = input.selector ? `\n**Selector:** ${input.selector}` : '';
        return {
          output: `### Extracted Content\n**Query:** ${input.query}${selectorNote}\n\n${content}`,
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
  return createBrowserTool(context, SNAPSHOT_DESCRIPTION, browserSnapshotInputSchema, (input, signal) => {
    return executeOperation({ ...input, tool: 'snapshot' }, signal);
  });
}

function createBrowserTool<TInput extends { headless?: boolean }>(
  context: ToolContext,
  description: string,
  inputSchema: z.ZodType<TInput>,
  executeAction: (input: TInput, signal?: AbortSignal) => Promise<unknown>,
) {
  const baseTool = tool({
    description,
    inputSchema,
    execute: async (input, execContext) => {
      return runBrowserTool(context, input, execContext, (signal) => executeAction(input, signal));
    },
  });

  return withTruncation(baseTool, { maxLines: 800, maxBytes: 16 * 1024 });
}

function createNavigateTool(context: ToolContext) {
  return createBrowserTool(context, NAVIGATE_DESCRIPTION, browserNavigateInputSchema, (input, signal) => {
    return executeOperation({ ...input, tool: 'navigate', op: input.action }, signal);
  });
}

function createInteractTool(context: ToolContext) {
  return createBrowserTool(context, INTERACT_DESCRIPTION, browserInteractInputSchema, (input, signal) => {
    return executeOperation({ ...input, tool: 'interact', op: input.action }, signal);
  });
}

function createWaitTool(context: ToolContext) {
  return createBrowserTool(context, WAIT_DESCRIPTION, browserWaitInputSchema, (input, signal) => {
    return executeOperation({ ...input, tool: 'wait', op: input.mode }, signal);
  });
}

function createScreenshotTool(context: ToolContext) {
  return createBrowserTool(context, SCREENSHOT_DESCRIPTION, browserScreenshotInputSchema, (input, signal) => {
    return executeOperation({ ...input, tool: 'screenshot', op: 'capture' }, signal);
  });
}

function createDialogTool(context: ToolContext) {
  return createBrowserTool(context, DIALOG_DESCRIPTION, browserDialogInputSchema, (input, signal) => {
    return executeOperation({ ...input, tool: 'dialog', op: input.action }, signal);
  });
}

function createContentTool(context: ToolContext) {
  return createBrowserTool(context, CONTENT_DESCRIPTION, browserContentInputSchema, (input, signal) => {
    return executeOperation({ ...input, tool: 'content', op: input.action }, signal);
  });
}

function createBatchTool(context: ToolContext) {
  const baseTool = tool({
    description: BATCH_DESCRIPTION,
    inputSchema: browserBatchInputSchema,
    execute: async (input, execContext) => {
      return runBrowserTool(context, input, execContext, async (signal) => {
        const browser = getBrowserManager();
        const results: Array<{
          index: number;
          tool: string;
          op?: string;
          status: 'ok' | 'error';
          output?: unknown;
          error?: string;
        }> = [];

        let stoppedReason: string | null = null;

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
              output: unknown;
            } = {
              index: i + 1,
              tool: action.tool,
              status: 'ok',
              output: result,
            };
            if (op) {
              resultRecord.op = op;
            }
            results.push(resultRecord);
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
              break;
            }
          }
        }

        const executed = results.length;
        const total = input.actions.length;
        const skipped = Math.max(total - executed, 0);
        const summary = stoppedReason
          ? `Batch executed ${executed}/${total} action(s). ${stoppedReason}`
          : `Batch executed ${executed}/${total} action(s) successfully.`;

        return {
          output: summary,
          results,
          stoppedReason,
          executed,
          skipped,
        };
      });
    },
  });

  return withTruncation(baseTool, { maxLines: 800, maxBytes: 16 * 1024 });
}

export function createRegisteredTools(context: ToolContext) {
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
