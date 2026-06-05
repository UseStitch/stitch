import { tool } from 'ai';

import { LIQUID_UI_TOOL_NAME } from '@stitch/shared/liquid-ui/constants';
import { liquidUiSpecSchema } from '@stitch/shared/liquid-ui/schema';

import type { ToolContext } from '@/tools/runtime/runtime.js';

export const DISPLAY_NAME = 'UI';

export function createRegisteredTool(_context: ToolContext) {
  return tool({
    description:
      'Render a rich inline UI block using the fixed Liquid UI component catalog. Use sparingly for structured data, status summaries, metrics, grouped information, or charts. The input must be the complete UI spec.',
    inputSchema: liquidUiSpecSchema,
    execute: async (input) => ({
      output: `Rendered ${LIQUID_UI_TOOL_NAME}.`,
      spec: input,
    }),
  });
}
