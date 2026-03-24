import { tool } from 'ai';
import fs from 'node:fs/promises';
import { z } from 'zod';

import {
  getFilePathPatternTargets,
  getParentDirPermissionSuggestion,
} from '@/tools/file-permissions.js';
import { isTextFileBuffer, truncateLine, validateAbsoluteFilePath } from '@/tools/shared.js';
import type { ToolContext } from '@/tools/wrappers.js';
import { withPermissionGate, withTruncation } from '@/tools/wrappers.js';

const DEFAULT_LIMIT = 2000;

const DESCRIPTION = `Read a file or directory from the local filesystem. If the path does not exist, an error is returned.

Usage:
- The filePath parameter should be an absolute path.
- By default, this tool returns up to 2000 lines from the start of the file.
- The offset parameter is the line number to start from (1-indexed).
- To read later sections, call this tool again with a larger offset.
- Use the grep tool to find specific content in large files or files with long lines.
- If you are unsure of the correct file path, use the glob tool to look up filenames by glob pattern.
- Contents are returned with each line prefixed by its line number as \`<line>: <content>\`. For example, if a file has contents "foo\\n", you will receive "1: foo\\n". For directories, entries are returned one per line (without line numbers) with a trailing \`/\` for subdirectories.
- Any line longer than 2000 characters is truncated.
- Call this tool in parallel when you know there are multiple files you want to read.
- Avoid tiny repeated slices (30 line chunks). If you need more context, read a larger window.
- This tool only supports text files. Non-text files will return an error.`;

const readInputSchema = z.object({
  filePath: z.string().describe('The absolute path to the file or directory to read'),
  offset: z.coerce
    .number()
    .describe('The line number to start reading from (1-indexed)')
    .optional(),
  limit: z.coerce
    .number()
    .describe('The maximum number of lines to read (defaults to 2000)')
    .optional(),
});

type ReadResult = {
  output: string;
  filePath: string;
};

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value));
}

function formatNumberedContent(content: string, offset: number, limit: number): string {
  const lines = content.split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }

  const startIndex = offset - 1;
  const selected = lines.slice(startIndex, startIndex + limit);

  return selected.map((line, index) => `${offset + index}: ${truncateLine(line)}`).join('\n');
}

export async function readPathContent(input: z.infer<typeof readInputSchema>): Promise<ReadResult> {
  const parsed = readInputSchema.parse(input);
  const targetPath = validateAbsoluteFilePath(parsed.filePath);
  const stats = await fs.stat(targetPath);

  if (stats.isDirectory()) {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const output = entries
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .sort((a, b) => a.localeCompare(b))
      .join('\n');

    return {
      output,
      filePath: targetPath,
    };
  }

  if (!stats.isFile()) {
    throw new Error('Path must point to a file or directory');
  }

  const buffer = await fs.readFile(targetPath);
  if (!isTextFileBuffer(buffer)) {
    throw new Error('Only text files are supported');
  }

  const offset = normalizePositiveInteger(parsed.offset, 1);
  const limit = normalizePositiveInteger(parsed.limit, DEFAULT_LIMIT);
  const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);

  return {
    output: formatNumberedContent(content, offset, limit),
    filePath: targetPath,
  };
}

function createReadTool() {
  return tool({
    description: DESCRIPTION,
    inputSchema: readInputSchema,
    execute: async (input) => readPathContent(input),
  });
}

function createTool() {
  return createReadTool();
}

function getPatternTargets(input: unknown): string[] {
  return getFilePathPatternTargets(input);
}

function getSuggestion(input: unknown) {
  return getParentDirPermissionSuggestion(input);
}

const shouldTruncate = true;

export const DISPLAY_NAME = 'Read';

export function createRegisteredTool(context: ToolContext) {
  const baseTool = createTool();
  const gatedTool = withPermissionGate(
    'read',
    {
      getPatternTargets,
      getSuggestion,
    },
    baseTool,
    context,
  );

  return shouldTruncate ? withTruncation(gatedTool) : gatedTool;
}
