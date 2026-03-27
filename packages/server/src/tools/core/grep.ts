import { tool } from 'ai';
import fs from 'node:fs/promises';
import { z } from 'zod';

import * as Glob from '@/lib/glob.js';
import {
  isTextFileBuffer,
  truncateLine,
  validateAbsoluteDirectoryPath,
} from '@/tools/runtime/shared.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';
import { withPermissionGate, withTruncation } from '@/tools/runtime/wrappers.js';

const MAX_MATCHES = 100;
const MAX_FILES_SCANNED = 2000;
const MAX_FILE_BYTES = 512 * 1024;

const DESCRIPTION = `Fast content search tool using regular expressions.

Usage:
- Searches file contents using regex pattern.
- include filters files by pattern (example: "*.ts" or "**/*.{ts,tsx}").
- Always provide a narrow absolute directory in path. Do not search the entire computer.
- Keep searches scoped and specific for performance.
- For very large repos, run multiple focused searches instead of one broad scan.`;

const grepInputSchema = z.object({
  pattern: z.string().describe('The regex pattern to search for in file contents'),
  path: z
    .string()
    .describe('Absolute directory path to search in. Required for performance and scope control.'),
  include: z
    .string()
    .optional()
    .describe('File pattern to include in the search (e.g. "*.ts", "**/*.{ts,tsx}")'),
});

type GrepResult = {
  output: string;
  pattern: string;
};

type Match = {
  filePath: string;
  lineNumber: number;
  lineText: string;
  mtimeMs: number;
};

export async function grepContent(input: z.infer<typeof grepInputSchema>): Promise<GrepResult> {
  const parsed = grepInputSchema.parse(input);
  const searchPath = validateAbsoluteDirectoryPath(parsed.path);
  const stats = await fs.stat(searchPath);
  if (!stats.isDirectory()) {
    throw new Error('path must point to a directory');
  }

  let regex: RegExp;
  try {
    regex = new RegExp(parsed.pattern);
  } catch {
    throw new Error('Invalid regex pattern');
  }

  const candidateFiles = await Glob.scan(parsed.include ?? '**/*', {
    cwd: searchPath,
    absolute: true,
    dot: true,
  });

  const filesWithMtime = await Promise.all(
    candidateFiles.map(async (filePath) => {
      const fileStats = await fs.stat(filePath).catch(() => null);
      if (!fileStats?.isFile()) return null;
      return {
        filePath,
        mtimeMs: fileStats.mtimeMs,
        size: fileStats.size,
      };
    }),
  );

  const searchableFiles = filesWithMtime
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const matches: Match[] = [];
  let scannedFiles = 0;
  let truncatedByMatchLimit = false;
  let truncatedByFileLimit = false;
  let skippedLargeFiles = 0;

  for (const file of searchableFiles) {
    if (scannedFiles >= MAX_FILES_SCANNED) {
      truncatedByFileLimit = true;
      break;
    }

    scannedFiles += 1;

    if (file.size > MAX_FILE_BYTES) {
      skippedLargeFiles += 1;
      continue;
    }

    const buffer = await fs.readFile(file.filePath).catch(() => null);
    if (!buffer || !isTextFileBuffer(buffer)) {
      continue;
    }

    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      if (!regex.test(lines[i])) {
        continue;
      }

      matches.push({
        filePath: file.filePath,
        lineNumber: i + 1,
        lineText: truncateLine(lines[i]),
        mtimeMs: file.mtimeMs,
      });

      if (matches.length >= MAX_MATCHES) {
        truncatedByMatchLimit = true;
        break;
      }
    }

    if (truncatedByMatchLimit) {
      break;
    }
  }

  if (matches.length === 0) {
    return {
      output: 'No files found',
      pattern: parsed.pattern,
    };
  }

  const outputLines = [
    `Found ${truncatedByMatchLimit ? `at least ${MAX_MATCHES}` : matches.length} matches${truncatedByMatchLimit ? ` (showing first ${MAX_MATCHES})` : ''}`,
  ];

  let currentFile = '';
  for (const match of matches) {
    if (match.filePath !== currentFile) {
      if (currentFile !== '') {
        outputLines.push('');
      }
      currentFile = match.filePath;
      outputLines.push(`${match.filePath}:`);
    }

    outputLines.push(`  Line ${match.lineNumber}: ${match.lineText}`);
  }

  if (truncatedByMatchLimit || truncatedByFileLimit || skippedLargeFiles > 0) {
    outputLines.push('');
  }

  if (truncatedByMatchLimit) {
    outputLines.push(
      `(Results truncated at ${MAX_MATCHES} matches. Narrow the path/include/pattern for better performance.)`,
    );
  }

  if (truncatedByFileLimit) {
    outputLines.push(
      `(Search stopped after scanning ${MAX_FILES_SCANNED} files. Narrow the path/include for better performance.)`,
    );
  }

  if (skippedLargeFiles > 0) {
    outputLines.push(`(${skippedLargeFiles} large files were skipped to keep search responsive.)`);
  }

  return {
    output: outputLines.join('\n'),
    pattern: parsed.pattern,
  };
}

function createGrepTool() {
  return tool({
    description: DESCRIPTION,
    inputSchema: grepInputSchema,
    execute: async (input) => grepContent(input),
  });
}

function getPatternTargets(input: unknown): string[] {
  const target = (input as { path?: unknown })?.path;
  return typeof target === 'string' && target.length > 0 ? [target] : [];
}

function getSuggestion() {
  return null;
}

const shouldTruncate = true;

export const DISPLAY_NAME = 'Grep';

export function createRegisteredTool(context: ToolContext) {
  const baseTool = createGrepTool();
  const gatedTool = withPermissionGate(
    'grep',
    {
      getPatternTargets,
      getSuggestion,
    },
    baseTool,
    context,
  );

  return shouldTruncate ? withTruncation(gatedTool) : gatedTool;
}
