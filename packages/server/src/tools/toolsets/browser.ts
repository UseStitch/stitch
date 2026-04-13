import { BROWSER_TOOL_INSTRUCTIONS } from '@/lib/browser/tool-config.js';
import { createRegisteredTools } from '@/tools/core/browser.js';
import type { Toolset } from '@/tools/toolsets/types.js';

export function createBrowserToolset(): Toolset {
  return {
    id: 'browser',
    name: 'Browser',
    description:
      'Control a Chrome browser: navigate pages, click elements, type text, take screenshots, and interact with web applications.',
    instructions: BROWSER_TOOL_INSTRUCTIONS,
    tools: () => [
      {
        name: 'browser_snapshot',
        description: 'Capture a fresh snapshot with refs, URL, tabs, and page state.',
      },
      {
        name: 'browser_navigate',
        description: 'Navigate URLs, run web search, and manage tab focus/history.',
      },
      {
        name: 'browser_interact',
        description: 'Click, type, press, hover, select, scroll, resize, or evaluate scripts.',
      },
      {
        name: 'browser_wait',
        description: 'Wait by time or selector for deterministic page readiness.',
      },
      {
        name: 'browser_screenshot',
        description: 'Capture viewport, full-page, or element screenshots.',
      },
      {
        name: 'browser_dialog',
        description: 'Inspect and handle alert/confirm/prompt dialogs.',
      },
      {
        name: 'browser_content',
        description: 'Extract content, search visible text, and find DOM elements by selector.',
      },
      {
        name: 'browser_batch',
        description:
          'Run up to 5 browser actions in sequence with page-change and error stopping rules.',
      },
    ],
    activate: async (context) => createRegisteredTools(context),
  };
}
