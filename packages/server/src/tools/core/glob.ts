import { tool } from 'ai';
import fs from 'node:fs/promises';
import { z } from 'zod';

import * as Glob from '@/lib/glob.js';
import type { ToolDefinition } from '@/tools/runtime/pipeline.js';
import { validateAbsoluteDirectoryPath } from '@/tools/runtime/shared.js';

const MAX_RESULTS = 100;

const DESCRIPTION = `Fast file pattern matching tool.

Usage:
- Use this to discover files by name, extension, or path pattern.
- Do not use this to search file contents; use grep for that.
- Supports glob patterns like "**/*.ts" or "src/**/*.tsx".
- Returns matching file paths sorted by modification time (newest first).
- Always provide a narrow absolute directory in path. Do not search the entire computer.
- Keep searches scoped and specific for performance.
- If you need multiple searches, batch a few focused calls instead of one very broad pattern.

Example:
- To find prompt files, search with pattern \`**/*prompt*\` in the server source directory.`;

const globInputSchema = z.object({
  pattern: z.string().describe('The glob pattern to match files against'),
  path: z.string().describe('Absolute directory path to search in. Required to keep searches scoped and performant.'),
});

type GlobResult = { output: string; path: string };

export async function globPaths(input: z.infer<typeof globInputSchema>): Promise<GlobResult> {
  const parsed = globInputSchema.parse(input);
  const searchPath = validateAbsoluteDirectoryPath(parsed.path);
  const stats = await fs.stat(searchPath);
  if (!stats.isDirectory()) {
    throw new Error('path must point to a directory');
  }

  const matches = await Glob.scan(parsed.pattern, { cwd: searchPath, absolute: true, dot: true });

  const withMtime = await Promise.all(
    matches.map(async (filePath) => {
      const fileStats = await fs.stat(filePath).catch(() => null);
      return { filePath, mtime: fileStats?.mtimeMs ?? 0 };
    }),
  );

  const sorted = withMtime.sort((a, b) => b.mtime - a.mtime).map((entry) => entry.filePath);
  const truncated = sorted.length > MAX_RESULTS;
  const finalPaths = truncated ? sorted.slice(0, MAX_RESULTS) : sorted;

  if (finalPaths.length === 0) {
    return { output: 'No files found', path: searchPath };
  }

  const outputLines = [...finalPaths];
  if (truncated) {
    outputLines.push('');
    outputLines.push(
      `(Results are truncated: showing first ${MAX_RESULTS} results. Narrow the path or pattern for better performance.)`,
    );
  }

  return { output: outputLines.join('\n'), path: searchPath };
}

function createGlobTool() {
  return tool({ description: DESCRIPTION, inputSchema: globInputSchema, execute: async (input) => globPaths(input) });
}

function getPatternTargets(input: unknown): string[] {
  const target = (input as { path?: unknown })?.path;
  return typeof target === 'string' && target.length > 0 ? [target] : [];
}

function getSuggestion() {
  return null;
}

export const definition: ToolDefinition = {
  name: 'glob',
  displayName: 'File Search',
  tool: createGlobTool(),
  permission: { getPatternTargets, getSuggestion },
};
