import { tool } from 'ai';
import { z } from 'zod';

import { executeAppleScript } from '@/lib/macos/applescript-executor.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';
import { withPermissionGate, withTruncation } from '@/tools/runtime/wrappers.js';

const TOOL_DESCRIPTION = `Execute AppleScript on macOS via osascript. Use this to control applications, automate workflows, and interact with system features.

Refer to the macOS toolset instructions for common patterns and examples.

Returns the script's text output on success, or a descriptive error message on failure.`;

const macosInputSchema = z.object({
  script: z.string().describe('The AppleScript to execute via osascript.'),
  timeout: z
    .number()
    .optional()
    .describe('Execution timeout in seconds. Default 10, max 30.'),
});

function createAppleScriptTool() {
  return tool({
    description: TOOL_DESCRIPTION,
    inputSchema: macosInputSchema,
    execute: async (input, { abortSignal }) => {
      try {
        const output = await executeAppleScript(input.script, {
          timeout: input.timeout,
          signal: abortSignal,
        });
        return { output: output || '(no output)' };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        const message = error instanceof Error ? error.message : String(error);
        return { error: message };
      }
    },
  });
}

export function createRegisteredTool(context: ToolContext) {
  return withTruncation(
    withPermissionGate(
      'applescript',
      {
        getPatternTargets: (input) => {
          const { script } = input as z.infer<typeof macosInputSchema>;
          return [script];
        },
        getSuggestion: () => null,
      },
      createAppleScriptTool(),
      context,
    ),
  );
}
