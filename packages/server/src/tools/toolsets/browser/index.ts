import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { toolError } from '@stitch/shared/tools/types';

import { sendBrowserCommand } from '@/lib/browser/browser-manager.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import { snapshotFields, summarizeOperationResult, withFreshSnapshot } from '@/tools/toolsets/browser/formatters.js';
import {
  actionTerminatesSequence,
  executeOperation,
  shouldReturnFreshSnapshot,
} from '@/tools/toolsets/browser/operations.js';
import { runBrowserTool } from '@/tools/toolsets/browser/queue.js';
import {
  browserBatchInputSchema,
  browserContentInputSchema,
  browserDialogInputSchema,
  browserInteractInputSchema,
  browserNavigateInputSchema,
  browserScreenshotInputSchema,
  browserSnapshotInputSchema,
  browserWaitInputSchema,
  type OperationInput,
} from '@/tools/toolsets/browser/schemas.js';
import { serializeBrowserSnapshot } from '@/tools/toolsets/browser/snapshot-serializer.js';
import { TOOLSET_SUMMARY_CONTEXT, summarizeTools, type Toolset } from '@/tools/toolsets/types.js';

const BROWSER_TOOL_INSTRUCTIONS = `You control a real Chrome browser. Before browser work, load the \`browser-automation\` skill for the batching contract and examples.

Always start with \`browser_snapshot\` and use refs from the latest snapshot. Prefer \`browser_batch\` over single calls for any chain of 2+ same-goal actions.

Batch independent browser tool calls in a single step instead of one per turn. Only go one-at-a-time when the next call genuinely needs the previous result.`;

const SNAPSHOT_DESCRIPTION = `Capture the current browser state as a fresh snapshot.

Use this before interactions to get current refs. The snapshot includes URL, tabs, viewport and scroll metadata, element bounds, visible/interactable nodes, shadow DOM where accessible, same-origin iframe summaries, and refs like [ref=e12].`;

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
- evaluate (JavaScript, last resort)

Use refs from the latest snapshot for element-targeted actions. Navigation-capable interactions return an updated snapshot in the result.`;

const WAIT_DESCRIPTION = `Wait for page conditions.

Modes:
- time: wait a fixed duration using timeMs
- selector: wait for a CSS selector using selector

Use timeoutMs to cap the maximum wait.`;

const SCREENSHOT_DESCRIPTION = `Take a browser screenshot.

Supports viewport, full-page, and element screenshots (via ref). Returns base64 PNG or JPEG image data and format.`;

const DIALOG_DESCRIPTION = `Inspect and control browser dialogs (alert/confirm/prompt).

Actions:
- state: check if a dialog is open
- handle: accept or dismiss the open dialog`;

const CONTENT_DESCRIPTION = `Query or extract content from the current page.

Actions:
- extract: extract page text, optionally with links/images/schema-shaped data
- search_page: fast visible-text pattern search
- find_elements: query DOM elements by CSS selector`;

const BATCH_DESCRIPTION = `Execute up to 5 browser actions in one serialized call.

Use this for efficient, single-goal chains like type + type + click. Actions execute in order and stop early on error, sequence-terminating actions, or a lightweight DOM/page fingerprint change by default. Results are concise; if the batch changes page state, the result includes an updated snapshot.`;

const BROWSER_TOOL_SPECS: Array<
  [
    name: string,
    description: string,
    schema: z.ZodType,
    toOperation: (input: Record<string, unknown>) => Record<string, unknown>,
  ]
> = [
  ['browser_snapshot', SNAPSHOT_DESCRIPTION, browserSnapshotInputSchema, (input) => ({ ...input, tool: 'snapshot' })],
  [
    'browser_navigate',
    NAVIGATE_DESCRIPTION,
    browserNavigateInputSchema,
    (input) => ({ ...input, tool: 'navigate', op: input.action }),
  ],
  [
    'browser_interact',
    INTERACT_DESCRIPTION,
    browserInteractInputSchema,
    (input) => ({ ...input, tool: 'interact', op: input.action }),
  ],
  ['browser_wait', WAIT_DESCRIPTION, browserWaitInputSchema, (input) => ({ ...input, tool: 'wait', op: input.mode })],
  [
    'browser_screenshot',
    SCREENSHOT_DESCRIPTION,
    browserScreenshotInputSchema,
    (input) => ({ ...input, tool: 'screenshot', op: 'capture' }),
  ],
  [
    'browser_dialog',
    DIALOG_DESCRIPTION,
    browserDialogInputSchema,
    (input) => ({ ...input, tool: 'dialog', op: input.action }),
  ],
  [
    'browser_content',
    CONTENT_DESCRIPTION,
    browserContentInputSchema,
    (input) => ({ ...input, tool: 'content', op: input.action }),
  ],
];

function createBatchTool(context: ToolContext) {
  return tool({
    description: BATCH_DESCRIPTION,
    inputSchema: browserBatchInputSchema,
    execute: async (input, execContext) => {
      return runBrowserTool(execContext.abortSignal, context.sessionId, async (signal) => {
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
        let lastSuccessfulAction = null as Parameters<typeof shouldReturnFreshSnapshot>[0] | null;

        for (let i = 0; i < input.actions.length; i++) {
          const action = input.actions[i];
          const op = action.op;

          let beforeState: string | null = null;
          try {
            beforeState = JSON.stringify(await sendBrowserCommand({ action: 'executionState' }, signal));
          } catch {
            beforeState = null;
          }

          try {
            const result = await executeOperation(action, signal);
            const resultRecord: { index: number; tool: string; op?: string; status: 'ok'; output: string } = {
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
            const message = Error.isError(error) ? error.message : String(error);
            const errorRecord: { index: number; tool: string; op?: string; status: 'error'; error: string } = {
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
            freshSnapshot = await sendBrowserCommand({ action: 'snapshot' }, signal);
            break;
          }

          if (input.stopOnPageChange) {
            let afterState: string | null = null;
            try {
              afterState = JSON.stringify(await sendBrowserCommand({ action: 'executionState' }, signal));
            } catch {
              afterState = null;
            }

            if (beforeState && afterState && beforeState !== afterState) {
              stoppedReason = `Stopped after action ${i + 1}: page state changed.`;
              freshSnapshot = await sendBrowserCommand({ action: 'snapshot' }, signal);
              break;
            }
          }
        }

        if (!freshSnapshot && lastSuccessfulAction && shouldReturnFreshSnapshot(lastSuccessfulAction)) {
          freshSnapshot = await sendBrowserCommand({ action: 'snapshot' }, signal);
        }

        const executed = results.length;
        const total = input.actions.length;
        const skipped = Math.max(total - executed, 0);
        const summaryText = stoppedReason
          ? `Batch executed ${executed}/${total} action(s). ${stoppedReason}`
          : `Batch executed ${executed}/${total} action(s) successfully.`;
        const resultLines = results.map((result) => {
          const action = input.actions[result.index - 1] as (typeof input.actions)[number] | undefined;
          const label = action
            ? `${result.index}. ${action.tool}${action.op ? `.${action.op}` : ''}`
            : `${result.index}. action`;
          if (result.status === 'error') return `${label}: error - ${result.error}`;
          return `${label}: ok${result.output ? ` - ${result.output}` : ''}`;
        });
        const outputText = resultLines.length > 0 ? `${summaryText}\n${resultLines.join('\n')}` : summaryText;
        const compactSnapshot = freshSnapshot ? serializeBrowserSnapshot(freshSnapshot) : null;
        const summary = compactSnapshot ? `${outputText}\n\n### Updated Snapshot\n${compactSnapshot.text}` : outputText;

        const errorResults = results.filter((result) => result.status === 'error');
        if (errorResults.length === results.length || stoppedReason?.startsWith('Stopped on error')) {
          return toolError(summary, { results, stoppedReason, executed, skipped });
        }

        return { output: summary, results, stoppedReason, executed, skipped, ...snapshotFields(compactSnapshot) };
      });
    },
  });
}

function createBrowserTools(context: ToolContext): Record<string, Tool> {
  return {
    ...Object.fromEntries(
      BROWSER_TOOL_SPECS.map(([name, description, schema, toOperation]) => [
        name,
        tool({
          description,
          inputSchema: schema,
          execute: async (input, execContext) =>
            runBrowserTool(execContext.abortSignal, context.sessionId, async (signal) => {
              const operation = toOperation(input as Record<string, unknown>) as OperationInput;
              const result = await executeOperation(operation, signal);
              if (!shouldReturnFreshSnapshot(operation)) return result;
              return withFreshSnapshot(result as Record<string, unknown>, signal);
            }),
        }),
      ]),
    ),
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
