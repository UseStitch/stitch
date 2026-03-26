import { tool } from 'ai';
import { z } from 'zod';

import { getBrowserManager } from '@/lib/browser/browser-manager.js';
import { BROWSER_ACTIONS } from '@/lib/browser/types.js';
import type { ScrollDirection } from '@/lib/browser/types.js';
import type { ToolContext } from '@/tools/wrappers.js';
import { withTruncation } from '@/tools/wrappers.js';

const browserInputSchema = z.object({
  action: z.enum(BROWSER_ACTIONS).describe('The browser action to perform.'),
  url: z.string().optional().describe('URL for navigate or tab_new actions.'),
  ref: z
    .string()
    .optional()
    .describe(
      'Element ref from a snapshot (e.g. "e1", "e2"). Used by click, type, hover, select, scroll.',
    ),
  text: z.string().optional().describe('Text to type (type action) or text to wait for (wait action).'),
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
    .describe('CSS selector. For wait action or find_elements action.'),
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
    .describe(
      'Specific attributes to extract (e.g. ["href", "src"]). For find_elements action.',
    ),
  includeText: z
    .boolean()
    .optional()
    .describe('Include element text content. For find_elements action. Default true.'),
});

type BrowserInput = z.infer<typeof browserInputSchema>;

const TOOL_DESCRIPTION = `Control a Chrome browser to interact with web pages. The browser launches automatically on first use with a dedicated persistent profile — any logins, cookies, or settings you configure will be remembered across sessions.

## Core workflow
1. Use **snapshot** to get a YAML accessibility tree with element refs (e.g. [ref=e1])
2. Use refs to interact: click ref=e3, type into ref=e5, hover ref=e7
3. After actions that change the page, take a new **snapshot** to get updated refs

## Action hierarchy (prefer actions higher in the list)
1. **snapshot** + ref-based actions (click, type, hover, select) — primary workflow
2. **search_page** / **find_elements** — lightweight, zero-cost lookups (no full snapshot needed)
3. **evaluate** — last resort for complex DOM manipulation only

## Actions
- **snapshot**: Get accessibility tree with element refs. Always do this first.
- **navigate**: Go to a URL (set \`url\`)
- **click**: Click an element (set \`ref\`, optionally \`doubleClick\`, \`button\`, \`modifiers\`)
- **type**: Type text into a focused element (set \`ref\` and \`text\`, optionally \`submit\`, \`slowly\`)
- **press**: Press a key (set \`key\`, e.g. "Enter", "Tab", "Escape", "ArrowDown")
- **hover**: Hover over an element (set \`ref\`)
- **select**: Select option(s) in a <select> (set \`ref\` and \`values\`)
- **scroll**: Scroll the page or an element (set \`direction\`, optionally \`ref\`)
- **screenshot**: Take a screenshot (returned as base64 PNG)
- **go_back** / **go_forward**: Navigate history
- **tab_new**: Open a new tab (optionally set \`url\`)
- **tab_list**: List all open tabs
- **tab_focus**: Focus a tab (set \`tabId\`)
- **tab_close**: Close a tab (set \`tabId\`, defaults to active)
- **search_page**: Search visible page text for a pattern (set \`pattern\`, optionally \`regex\`, \`caseSensitive\`, \`contextChars\`, \`cssScope\`, \`maxResults\`). Fast, zero LLM cost. Use to find text, verify content exists, or locate data without a full snapshot.
- **find_elements**: Query DOM elements by CSS selector (set \`selector\`, optionally \`attributes\`, \`maxResults\`, \`includeText\`). Fast, zero LLM cost. Use to explore page structure, count items, or extract attributes like href/src.
- **evaluate**: Run JavaScript in the page (set \`fn\`). Use only when ref-based actions and search/find tools are insufficient.
- **wait**: Wait for time or selector (set \`timeMs\` and/or \`selector\`)
- **resize**: Resize viewport (set \`width\` and \`height\`)

## Failure recovery
- If a ref is not found, the page has likely changed — take a fresh **snapshot** first.
- If the same action fails twice, change strategy: try a different selector, scroll to reveal the element, or use **search_page** to verify the content exists.
- If blocked by a modal, cookie banner, or dialog, dismiss the blocker first before continuing.

## Tab discipline
- Open research/reference pages in a **new tab** to keep the main task tab clean.
- Close tabs you no longer need with **tab_close**.`;


async function executeBrowserAction(input: BrowserInput, signal?: AbortSignal): Promise<unknown> {
  const browser = getBrowserManager();

  // Auto-launch on first use
  if (input.action === 'navigate' || input.action === 'snapshot' || input.action === 'tab_new') {
    await browser.launch();
  }

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
      const result = await browser.searchPage({
        pattern: input.pattern,
        regex: input.regex,
        caseSensitive: input.caseSensitive,
        contextChars: input.contextChars,
        cssScope: input.cssScope,
        maxResults: input.maxResults,
      }, signal);
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
      const result = await browser.findElements({
        selector: input.selector,
        attributes: input.attributes,
        maxResults: input.maxResults,
        includeText: input.includeText,
      }, signal);
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

export function createRegisteredTool(_context: ToolContext) {
  const baseTool = createBrowserTool();
  return withTruncation(baseTool);
}
