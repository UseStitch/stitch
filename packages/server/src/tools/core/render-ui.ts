import { tool } from 'ai';

import { LIQUID_UI_TOOL_NAME } from '@stitch/shared/liquid-ui/constants';
import { liquidUiSpecSchema } from '@stitch/shared/liquid-ui/schema';

import type { ToolDefinition } from '@/tools/runtime/pipeline.js';

export const definition: ToolDefinition = {
  name: 'render_ui',
  displayName: 'UI',
  tool: tool({
    description:
      'Render a rich inline UI block using the fixed Liquid UI component catalog. Use sparingly for structured data, status summaries, metrics, grouped information, or charts. The input must be the complete UI spec.',
    inputSchema: liquidUiSpecSchema,
    execute: async (input) => ({ output: `Rendered ${LIQUID_UI_TOOL_NAME}.`, spec: input }),
  }),
};
