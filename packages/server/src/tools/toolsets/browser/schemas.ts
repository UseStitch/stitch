import { z } from 'zod';

const descriptionField = z
  .string()
  .describe('Short description of the task this browser action is performing. Shown to the user.');

const timeoutField = z.number().optional().describe('Action timeout in milliseconds.');

const outputSchemaField = z
  .record(z.string(), z.unknown())
  .optional()
  .describe('Optional JSON Schema object. Supported properties are returned in a data object.');

export const browserSnapshotInputSchema = z.object({ description: descriptionField });

export const browserNavigateInputSchema = z.object({
  description: descriptionField,
  action: z
    .enum(['navigate', 'search', 'go_back', 'go_forward', 'tab_new', 'tab_list', 'tab_focus', 'tab_close'])
    .describe('Navigation action to perform.'),
  url: z.string().optional().describe('URL for navigate or tab_new actions.'),
  query: z.string().optional().describe('Search query for search action.'),
  engine: z.string().optional().describe('Search engine: google, duckduckgo, bing.'),
  tabId: z.string().optional().describe('Tab ID for tab_focus or tab_close actions.'),
  timeoutMs: timeoutField,
});

export const browserInteractInputSchema = z.object({
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
      'evaluate',
    ])
    .describe('Interaction action to perform.'),
  ref: z
    .string()
    .optional()
    .describe('Element ref from a snapshot (e.g. "e1", "e2"). Required for click/type/hover/select/dropdown actions.'),
  text: z.string().optional().describe('Text to type, or dropdown option text to select.'),
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
  fn: z.string().optional().describe('JavaScript expression to evaluate. Required for evaluate action.'),
  timeoutMs: timeoutField,
});

export const browserWaitInputSchema = z.object({
  description: descriptionField,
  mode: z
    .enum(['time', 'selector'])
    .describe('Wait mode. Use time for timed waits and selector for CSS selector waits.'),
  timeMs: z.number().optional().describe('Time to wait in milliseconds. Required for time mode.'),
  selector: z.string().optional().describe('CSS selector to wait for. Required for selector mode.'),
  timeoutMs: timeoutField,
});

export const browserScreenshotInputSchema = z.object({
  description: descriptionField,
  ref: z.string().optional().describe('Element ref for element screenshot.'),
  format: z.enum(['png', 'jpeg']).optional().describe('Screenshot format. Default png.'),
  quality: z.number().optional().describe('Screenshot quality 0-100 for jpeg.'),
  fullPage: z.boolean().optional().describe('Capture full page screenshot.'),
  path: z
    .string()
    .optional()
    .describe(
      'File path to save the screenshot to. If provided, the screenshot is written to disk at this path. Parent directories are created if needed. Supports absolute or relative paths.',
    ),
});

export const browserDialogInputSchema = z.object({
  description: descriptionField,
  action: z.enum(['state', 'handle']).describe('Dialog action to perform.'),
  dialogAction: z.enum(['accept', 'dismiss']).optional().describe('Whether to accept or dismiss a dialog.'),
  promptText: z.string().optional().describe('Optional prompt text when accepting prompt dialogs.'),
});

export const browserContentInputSchema = z.object({
  description: descriptionField,
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
  includeLinks: z.boolean().optional().describe('Include links for extract action.'),
  includeImages: z.boolean().optional().describe('Include images for extract action.'),
  outputSchema: outputSchemaField,
});

const browserBatchActionSchema = z
  .object({
    tool: z
      .enum(['snapshot', 'navigate', 'interact', 'wait', 'screenshot', 'dialog', 'content'])
      .describe('Tool group to execute for this batch action.'),
    op: z.string().optional().describe('Operation name within the selected tool group.'),
  })
  .extend(browserNavigateInputSchema.omit({ description: true, action: true }).partial().shape)
  .extend(browserInteractInputSchema.omit({ description: true, action: true }).partial().shape)
  .extend(browserWaitInputSchema.omit({ description: true }).partial().shape)
  .extend(browserScreenshotInputSchema.omit({ description: true }).partial().shape)
  .extend(browserDialogInputSchema.omit({ description: true, action: true }).partial().shape)
  .extend(browserContentInputSchema.omit({ description: true, action: true }).partial().shape);

export const browserBatchInputSchema = z.object({
  description: descriptionField,
  actions: z.array(browserBatchActionSchema).min(1).max(5).describe('Sequential actions to execute.'),
  stopOnPageChange: z
    .boolean()
    .optional()
    .default(true)
    .describe('Stop executing remaining actions if page state changes.'),
  stopOnError: z.boolean().optional().default(true).describe('Stop executing remaining actions when an action fails.'),
});

export type BatchAction = z.infer<typeof browserBatchActionSchema>;

export type OperationInput = BatchAction & {
  tool: 'snapshot' | 'navigate' | 'interact' | 'wait' | 'screenshot' | 'dialog' | 'content';
};
