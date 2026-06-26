import { tool } from 'ai';
import { z } from 'zod';

import { getBrowserManager } from '@/lib/browser/browser-manager.js';
import { serializeBrowserSnapshot } from '@/tools/toolsets/browser/snapshot-serializer.js';
import {
  browserBatchInputSchema,
  browserContentInputSchema,
  browserDialogInputSchema,
  browserInteractInputSchema,
  browserNavigateInputSchema,
  browserScreenshotInputSchema,
  browserSnapshotInputSchema,
  browserWaitInputSchema,
} from '@/tools/toolsets/browser/schemas.js';
import {
  actionTerminatesSequence,
  executeOperation,
  shouldReturnFreshSnapshot,
} from '@/tools/toolsets/browser/operations.js';
import { summarizeOperationResult, withFreshSnapshot } from '@/tools/toolsets/browser/formatters.js';
import { runBrowserTool } from '@/tools/toolsets/browser/queue.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
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

function createSnapshotTool(context: ToolContext) {
  return createBrowserTool(
    context,
    SNAPSHOT_DESCRIPTION,
    browserSnapshotInputSchema,
    (input, signal) => executeOperation({ ...input, tool: 'snapshot' }, signal),
  );
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
  return createBrowserTool(context, WAIT_DESCRIPTION, browserWaitInputSchema, (input, signal) =>
    executeOperation({ ...input, tool: 'wait', op: input.mode }, signal),
  );
}

function createScreenshotTool(context: ToolContext) {
  return createBrowserTool(
    context,
    SCREENSHOT_DESCRIPTION,
    browserScreenshotInputSchema,
    (input, signal) => executeOperation({ ...input, tool: 'screenshot', op: 'capture' }, signal),
  );
}

function createDialogTool(context: ToolContext) {
  return createBrowserTool(
    context,
    DIALOG_DESCRIPTION,
    browserDialogInputSchema,
    (input, signal) => executeOperation({ ...input, tool: 'dialog', op: input.action }, signal),
  );
}

function createContentTool(context: ToolContext) {
  return createBrowserTool(
    context,
    CONTENT_DESCRIPTION,
    browserContentInputSchema,
    (input, signal) => executeOperation({ ...input, tool: 'content', op: input.action }, signal),
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
        let lastSuccessfulAction = null as Parameters<typeof shouldReturnFreshSnapshot>[0] | null;

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
            ? `${result.index}. ${action.tool}${action.op ? `.${action.op}` : ''}`
            : `${result.index}. action`;
          if (result.status === 'error') return `${label}: error - ${result.error}`;
          return `${label}: ok${result.output ? ` - ${result.output}` : ''}`;
        });
        const outputText =
          resultLines.length > 0 ? `${summaryText}\n${resultLines.join('\n')}` : summaryText;
        const compactSnapshot = freshSnapshot ? serializeBrowserSnapshot(freshSnapshot) : null;
        const summary = compactSnapshot
          ? `${outputText}\n\n### Updated Snapshot\n${compactSnapshot.text}`
          : outputText;

        return {
          output: summary,
          results,
          stoppedReason,
          executed,
          skipped,
          snapshot: compactSnapshot?.text,
          snapshotFingerprint: compactSnapshot?.fingerprint,
          snapshotOriginalChars: compactSnapshot?.originalChars,
          snapshotTruncated: compactSnapshot?.truncated,
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
