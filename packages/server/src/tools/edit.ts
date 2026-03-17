import fs from 'node:fs/promises';
import path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';

import type { ToolContext } from '@/tools/wrappers.js';
import { withPermissionGate, withTruncation } from '@/tools/wrappers.js';

const MULTIPLE_MATCHES_ERROR =
  'Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match.';

const editInputSchema = z.object({
  filePath: z.string().describe('The absolute path to the file to modify'),
  oldString: z
    .string()
    .min(1)
    .describe('The text to replace'),
  newString: z.string().describe('The text to replace it with (must be different from oldString)'),
  replaceAll: z
    .boolean()
    .optional()
    .describe('Replace all occurrences of oldString (default false)'),
}).refine((value) => value.newString !== value.oldString, {
  message: 'newString must be different from oldString',
  path: ['newString'],
});

function validateAbsoluteFilePath(filePath: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new Error('filePath must be an absolute path');
  }

  return path.resolve(filePath);
}

function countOccurrences(content: string, oldString: string): number {
  let count = 0;
  let startIndex = 0;

  while (true) {
    const index = content.indexOf(oldString, startIndex);
    if (index === -1) return count;
    count += 1;
    startIndex = index + oldString.length;
  }
}

export async function editFileContent(input: z.infer<typeof editInputSchema>): Promise<string> {
  const parsed = editInputSchema.parse(input);
  const targetPath = validateAbsoluteFilePath(parsed.filePath);
  const content = await fs.readFile(targetPath, 'utf8');
  const matchCount = countOccurrences(content, parsed.oldString);

  if (matchCount === 0) {
    throw new Error('oldString not found in content');
  }

  if (!parsed.replaceAll && matchCount > 1) {
    throw new Error(MULTIPLE_MATCHES_ERROR);
  }

  const nextContent = parsed.replaceAll
    ? content.replaceAll(parsed.oldString, parsed.newString)
    : content.replace(parsed.oldString, parsed.newString);

  await fs.writeFile(targetPath, nextContent, 'utf8');
  return targetPath;
}

function createEditTool() {
  return tool({
    description: `Performs exact string replacements in files.

Usage:
- You must use your Read tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: line number + colon + space (e.g., \`1: \`). Everything after that space is the actual file content to match. Never include any part of the line number prefix in the oldString or newString.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if oldString is not found in the file with an error "oldString not found in content".
- The edit will FAIL if oldString is found multiple times in the file with an error "Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match." Either provide a larger string with more surrounding context to make it unique or use replaceAll to change every instance of oldString.
- Use replaceAll for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`,
    inputSchema: editInputSchema,
    execute: async (input) => {
      const targetPath = await editFileContent(input);

      return {
        output: `Edited file: ${targetPath}`,
        filePath: targetPath,
      };
    },
  });
}

function createTool() {
  return createEditTool();
}

function getPatternTargets(): string[] {
  return [];
}

function getSuggestion() {
  return null;
}

const shouldTruncate = true;

export function createRegisteredTool(context: ToolContext) {
  const baseTool = createTool();
  const gatedTool = withPermissionGate(
    'edit',
    {
      getPatternTargets,
      getSuggestion,
    },
    baseTool,
    context,
  );

  return shouldTruncate ? withTruncation(gatedTool) : gatedTool;
}

export { MULTIPLE_MATCHES_ERROR };
