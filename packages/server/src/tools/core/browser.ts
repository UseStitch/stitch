import { tool } from 'ai';
import { z } from 'zod';

import { getBrowserManager } from '@/lib/browser/browser-manager.js';
import { importChromeProfile, listChromeProfiles } from '@/lib/browser/chrome-profile-importer.js';
import { BROWSER_ACTIONS } from '@/lib/browser/types.js';
import type { ScrollDirection } from '@/lib/browser/types.js';
import * as Log from '@/lib/log.js';
import { askQuestion } from '@/question/service.js';
import { listSettings, saveSetting } from '@/settings/service.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';
import { withTruncation } from '@/tools/runtime/wrappers.js';

const browserInputSchema = z.object({
  action: z.enum(BROWSER_ACTIONS).describe('The browser action to perform.'),
  actions: z.array(z.object({
    action: z.enum(BROWSER_ACTIONS).describe('The browser action to perform.'),
    url: z.string().optional().describe('URL for navigate, tab_new, or search engine URL.'),
    ref: z.string().optional().describe('Element ref from a snapshot (e.g. "e1").'),
    text: z.string().optional().describe('Text to type or wait for.'),
    key: z.string().optional().describe('Key to press (e.g. "Enter", "Tab").'),
    values: z.array(z.string()).optional().describe('Option values to select.'),
    submit: z.boolean().optional().describe('Press Enter after typing.'),
    slowly: z.boolean().optional().describe('Type character by character.'),
    clear: z.boolean().optional().describe('Clear the field before typing.'),
    doubleClick: z.boolean().optional().describe('Double-click instead of single click.'),
    button: z.string().optional().describe('Mouse button: "left", "right", or "middle".'),
    modifiers: z.array(z.string()).optional().describe('Keyboard modifiers.'),
    direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction.'),
    fn: z.string().optional().describe('JavaScript expression to evaluate.'),
    width: z.number().optional().describe('Viewport width in pixels.'),
    height: z.number().optional().describe('Viewport height in pixels.'),
    tabId: z.string().optional().describe('Tab ID.'),
    timeMs: z.number().optional().describe('Wait time in ms.'),
    selector: z.string().optional().describe('CSS selector.'),
    pattern: z.string().optional().describe('Text pattern to search for.'),
    regex: z.boolean().optional().describe('Treat pattern as regex.'),
    caseSensitive: z.boolean().optional().describe('Case-sensitive search.'),
    contextChars: z.number().optional().describe('Context chars per match.'),
    cssScope: z.string().optional().describe('CSS selector to scope search within.'),
    maxResults: z.number().optional().describe('Max results to return.'),
    attributes: z.array(z.string()).optional().describe('Attributes to extract.'),
    includeText: z.boolean().optional().describe('Include element text content.'),
    query: z.string().optional().describe('Search query or extraction query.'),
    engine: z.string().optional().describe('Search engine: google, duckduckgo, bing.'),
  })).optional().describe('Array of actions for multi-action batching. Execute sequentially; stops if a page navigation occurs.'),
  url: z.string().optional().describe('URL for navigate or tab_new actions.'),
  ref: z
    .string()
    .optional()
    .describe(
      'Element ref from a snapshot (e.g. "e1", "e2"). Used by click, type, hover, select, scroll.',
    ),
  text: z
    .string()
    .optional()
    .describe('Text to type (type action) or text to wait for (wait action).'),
  key: z
    .string()
    .optional()
    .describe('Key to press (e.g. "Enter", "Tab", "Escape", "ArrowDown"). For press action.'),
  values: z.array(z.string()).optional().describe('Option values to select. For select action.'),
  submit: z.boolean().optional().describe('Press Enter after typing. For type action.'),
  slowly: z
    .boolean()
    .optional()
    .describe('Type character by character instead of filling. For type action.'),
  clear: z
    .boolean()
    .optional()
    .describe('Clear the field before typing. For type action.'),
  doubleClick: z
    .boolean()
    .optional()
    .describe('Double-click instead of single click. For click action.'),
  button: z
    .string()
    .optional()
    .describe('Mouse button: "left", "right", or "middle". For click action.'),
  modifiers: z
    .array(z.string())
    .optional()
    .describe('Keyboard modifiers: "Alt", "Control", "Meta", "Shift". For click action.'),
  direction: z
    .enum(['up', 'down', 'left', 'right'])
    .optional()
    .describe('Direction to scroll. For scroll action.'),
  fn: z
    .string()
    .optional()
    .describe('JavaScript expression to evaluate in the browser. For evaluate action.'),
  width: z.number().optional().describe('Viewport width in pixels. For resize action.'),
  height: z.number().optional().describe('Viewport height in pixels. For resize action.'),
  tabId: z.string().optional().describe('Tab ID for tab_focus or tab_close actions.'),
  timeMs: z.number().optional().describe('Time to wait in milliseconds. For wait action.'),
  selector: z
    .string()
    .optional()
    .describe('CSS selector. For wait, find_elements, or extract (scopes extraction to element) actions.'),
  pattern: z
    .string()
    .optional()
    .describe('Text pattern to search for. For search_page action.'),
  regex: z
    .boolean()
    .optional()
    .describe('Treat pattern as regex. For search_page action.'),
  caseSensitive: z
    .boolean()
    .optional()
    .describe('Case-sensitive search. For search_page action.'),
  contextChars: z
    .number()
    .optional()
    .describe('Characters of surrounding context per match. For search_page action.'),
  cssScope: z
    .string()
    .optional()
    .describe('CSS selector to scope search within. For search_page action.'),
  maxResults: z
    .number()
    .optional()
    .describe('Max results to return. For search_page or find_elements actions.'),
  attributes: z
    .array(z.string())
    .optional()
    .describe('Specific attributes to extract (e.g. ["href", "src"]). For find_elements action.'),
  includeText: z
    .boolean()
    .optional()
    .describe('Include element text content. For find_elements action. Default true.'),
  query: z
    .string()
    .optional()
    .describe('Search query for search action, or extraction query for extract action.'),
  engine: z
    .string()
    .optional()
    .describe('Search engine: "google" (default), "duckduckgo", "bing". For search action.'),
});

type BrowserInput = z.infer<typeof browserInputSchema>;

const TOOL_DESCRIPTION = `Control a Chrome browser to interact with web pages. The browser launches automatically on first use with a persistent profile.

## Multi-Action Batching
Use the \`actions\` array to execute multiple actions in one call. Actions run sequentially and stop automatically if a page navigation occurs. This is the most efficient way to fill forms, click through flows, etc.
Example: \`{"action": "snapshot", "actions": [{"action": "type", "ref": "e3", "text": "hello", "clear": true}, {"action": "type", "ref": "e5", "text": "world"}, {"action": "click", "ref": "e7"}]}\`
Note: The top-level \`action\` field is ignored when \`actions\` is provided.

## Actions
- **snapshot**: Get accessibility tree with element refs (e.g. [ref=e1]). Includes URL, tabs, scroll position, and page stats. New elements since last snapshot are marked with *[ref=eN]. Always do this first.
- **navigate**: Go to a URL (set \`url\`)
- **search**: Search the web directly (set \`query\`, optionally \`engine\`: google/duckduckgo/bing). Faster than manually navigating to a search engine.
- **extract**: Extract structured content from the current page (set \`query\` with what to extract, optionally \`selector\` with a CSS selector to scope extraction to a specific element). Uses the full page content, not just visible area. Great for pulling data, prices, article text, etc.
- **click**: Click an element (set \`ref\`)
- **type**: Type text (set \`ref\` and \`text\`, optionally \`submit\`, \`clear\`)
- **press**: Press a key (set \`key\`)
- **hover**: Hover over an element (set \`ref\`)
- **select**: Select option(s) in a <select> (set \`ref\` and \`values\`)
- **scroll**: Scroll the page or element (set \`direction\`, optionally \`ref\`)
- **screenshot**: Take a screenshot (base64 PNG)
- **go_back** / **go_forward**: Navigate history
- **tab_new** / **tab_list** / **tab_focus** / **tab_close**: Tab management
- **search_page**: Search visible text for a pattern (set \`pattern\`). Zero cost, instant.
- **find_elements**: Query DOM by CSS selector (set \`selector\`). Zero cost, instant.
- **evaluate**: Run JavaScript in the page (set \`fn\`). Last resort.
- **wait**: Wait for time or selector
- **resize**: Resize viewport`;


// Page-changing actions that should stop multi-action batching if they trigger navigation
const PAGE_CHANGING_ACTIONS = new Set(['navigate', 'search', 'go_back', 'go_forward', 'tab_new', 'tab_focus', 'evaluate']);

async function executeSingleAction(input: BrowserInput, signal?: AbortSignal): Promise<unknown> {
  const browser = getBrowserManager();

  // Auto-launch on first use — any action can be the first call
  await browser.launch();

  switch (input.action) {
    case 'snapshot': {
      const tree = await browser.snapshot(signal);
      return { output: tree };
    }

    case 'navigate': {
      if (!input.url) throw new Error('Missing required field: url');
      const result = await browser.navigate(input.url, signal);
      return { output: result };
    }

    case 'search': {
      if (!input.query) throw new Error('Missing required field: query');
      const result = await browser.search(input.query, input.engine ?? 'google', signal);
      return { output: result };
    }

    case 'extract': {
      if (!input.query) throw new Error('Missing required field: query');
      const content = await browser.extractPageContent(signal, input.selector);
      const selectorNote = input.selector ? `\n**Selector:** ${input.selector}` : '';
      return {
        output: `### Extracted Content\n**Query:** ${input.query}${selectorNote}\n\n${content}`,
      };
    }

    case 'click': {
      if (!input.ref) throw new Error('Missing required field: ref');
      const result = await browser.click(input.ref, {
        doubleClick: input.doubleClick,
        button: input.button,
        modifiers: input.modifiers,
        signal,
      });
      return { output: result };
    }

    case 'type': {
      if (!input.ref) throw new Error('Missing required field: ref');
      if (!input.text) throw new Error('Missing required field: text');
      const result = await browser.type(input.ref, input.text, {
        slowly: input.slowly,
        submit: input.submit,
        clear: input.clear,
        signal,
      });
      return { output: result };
    }

    case 'press': {
      if (!input.key) throw new Error('Missing required field: key');
      const result = await browser.press(input.key, signal);
      return { output: result };
    }

    case 'hover': {
      if (!input.ref) throw new Error('Missing required field: ref');
      const result = await browser.hover(input.ref, signal);
      return { output: result };
    }

    case 'select': {
      if (!input.ref) throw new Error('Missing required field: ref');
      if (!input.values) throw new Error('Missing required field: values');
      const result = await browser.select(input.ref, input.values, signal);
      return { output: result };
    }

    case 'scroll': {
      if (!input.direction) throw new Error('Missing required field: direction');
      const result = await browser.scroll(input.ref, input.direction as ScrollDirection, signal);
      return { output: result };
    }

    case 'screenshot': {
      const result = await browser.screenshot(signal);
      return {
        output: `Screenshot taken (${result.format})`,
        data: result.data,
        format: result.format,
      };
    }

    case 'go_back': {
      const result = await browser.goBack(signal);
      return { output: result };
    }

    case 'go_forward': {
      const result = await browser.goForward(signal);
      return { output: result };
    }

    case 'tab_new': {
      const tab = await browser.newTab(input.url, signal);
      return { output: `Opened new tab: ${tab.id} (${tab.url})` };
    }

    case 'tab_list': {
      const tabs = await browser.listTabs(signal);
      const tabList = tabs
        .filter((t) => t.type === 'page')
        .map((t) => `  ${t.id}: ${t.title || '(untitled)'} — ${t.url}`)
        .join('\n');
      return { output: `Open tabs:\n${tabList}` };
    }

    case 'tab_focus': {
      if (!input.tabId) throw new Error('Missing required field: tabId');
      await browser.focusTab(input.tabId, signal);
      return { output: `Focused tab: ${input.tabId}` };
    }

    case 'tab_close': {
      await browser.closeTab(input.tabId, signal);
      return { output: `Closed tab: ${input.tabId ?? 'active'}` };
    }

    case 'evaluate': {
      if (!input.fn) throw new Error('Missing required field: fn');
      const result = await browser.evaluate(input.fn, signal);
      return {
        output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      };
    }

    case 'wait': {
      const result = await browser.wait(input.timeMs, input.selector, signal);
      return { output: result };
    }

    case 'resize': {
      if (!input.width) throw new Error('Missing required field: width');
      if (!input.height) throw new Error('Missing required field: height');
      const result = await browser.resize(input.width, input.height, signal);
      return { output: result };
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
      const matchLines = result.matches.map(
        (m, i) => `  ${i + 1}. "${m.match}" — ...${m.context}...`,
      );
      const showing = result.matches.length;
      const total = result.total;
      const summary =
        total === 0
          ? `No matches for "${input.pattern}".`
          : `Found ${total} match${total !== 1 ? 'es' : ''} for "${input.pattern}"${showing < total ? ` (showing ${showing})` : ''}:\n${matchLines.join('\n')}`;
      return { output: summary };
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
      const summary =
        total === 0
          ? `No elements matching "${input.selector}".`
          : `Found ${total} element${total !== 1 ? 's' : ''} matching "${input.selector}"${showing < total ? ` (showing ${showing})` : ''}:\n${elemLines.join('\n')}`;
      return { output: summary };
    }
  }
}

async function executeBrowserAction(input: BrowserInput, signal?: AbortSignal): Promise<unknown> {
  // Multi-action batching: if `actions` array is provided, execute sequentially
  if (input.actions && input.actions.length > 0) {
    const results: { action: string; result: unknown }[] = [];

    for (let i = 0; i < input.actions.length; i++) {
      const actionInput = input.actions[i] as BrowserInput;

      try {
        const result = await executeSingleAction(actionInput, signal);
        results.push({ action: actionInput.action, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ action: actionInput.action, result: { error: message } });
        // Stop on error
        if (i < input.actions.length - 1) {
          results.push({
            action: 'skipped',
            result: { output: `Stopped: remaining ${input.actions.length - i - 1} action(s) skipped due to error.` },
          });
        }
        break;
      }

      // Stop after page-changing actions (navigation already happened)
      if (PAGE_CHANGING_ACTIONS.has(actionInput.action) && i < input.actions.length - 1) {
        results.push({
          action: 'skipped',
          result: { output: `Page changed after ${actionInput.action}. Remaining ${input.actions.length - i - 1} action(s) skipped. Take a new snapshot.` },
        });
        break;
      }
    }

    // Format combined results
    const outputLines = results.map((r, i) => {
      const res = r.result as Record<string, unknown>;
      const errorStr = typeof res.error === 'string' ? res.error : JSON.stringify(res.error);
      const outputStr = typeof res.output === 'string' ? res.output : JSON.stringify(res.output ?? '');
      const text = res.error ? `ERROR: ${errorStr}` : outputStr;
      return `[${i + 1}/${results.length}] ${r.action}: ${text}`;
    });
    return { output: outputLines.join('\n') };
  }

  // Single action execution
  return executeSingleAction(input, signal);
}

const log = Log.create({ service: 'tools.browser' });

let hasPromptedImport = false;

async function maybePromptProfileImport(
  context: ToolContext,
  toolCallId: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  if (hasPromptedImport) return;

  const settings = await listSettings();
  const imported = settings['browser.profileImported'];
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
    subAgentId: context.subAgentId,
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

  // User chose to import — pick which profile
  let profileId: string;
  if (profiles.length === 1) {
    profileId = profiles[0].id;
  } else {
    const profileAnswers = await askQuestion({
      sessionId: context.sessionId,
      messageId: context.messageId,
      streamRunId: context.streamRunId,
      toolCallId,
      subAgentId: context.subAgentId,
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
  await saveSetting('browser.profileImported', `${profileLabel} — ${timestamp}`);
  await saveSetting('browser.activeProfile', `chrome/${profileId}`);
}

function createBrowserTool() {
  return tool({
    description: TOOL_DESCRIPTION,
    inputSchema: browserInputSchema,
    execute: async (input, { abortSignal }) => {
      try {
        return await executeBrowserAction(input, abortSignal);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        const message = error instanceof Error ? error.message : String(error);
        return { error: message };
      }
    },
  });
}

export function createRegisteredTool(context: ToolContext) {
  const baseTool = createBrowserTool();

  const originalExecute = baseTool.execute!;
  const wrappedExecute: typeof originalExecute = async (input, execContext) => {
    try {
      await maybePromptProfileImport(context, execContext.toolCallId, execContext.abortSignal);
    } catch (error) {
      // If the prompt was aborted or rejected, log and continue with a clean browser
      log.info(
        { error: error instanceof Error ? error.message : String(error) },
        'Profile import prompt skipped',
      );
    }
    return originalExecute(input, execContext);
  };

  const toolWithImport = { ...baseTool, execute: wrappedExecute };
  return withTruncation(toolWithImport);
}
