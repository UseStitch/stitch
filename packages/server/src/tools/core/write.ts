import { tool } from 'ai';
import fs from 'node:fs/promises';
import { z } from 'zod';

import { getFilePathPatternTargets, getParentDirPermissionSuggestion } from '@/tools/runtime/file-permissions.js';
import type { ToolDefinition } from '@/tools/runtime/pipeline.js';
import { validateAbsoluteFilePath } from '@/tools/runtime/shared.js';

const writeInputSchema = z.object({
  content: z.string().describe('The content to write to the file'),
  filePath: z.string().describe('The absolute path to the file to write (must be absolute, not relative)'),
});

export async function writeFileContent(filePath: string, content: string): Promise<string> {
  const targetPath = validateAbsoluteFilePath(filePath);
  await fs.writeFile(targetPath, content, 'utf8');
  return targetPath;
}

function createWriteTool() {
  return tool({
    description: `Writes a file to the local filesystem.

Usage:
- Use this to create a new file or fully replace a file when that is clearly required.
- Do not use this for targeted edits to an existing file; use Edit instead.
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`,
    inputSchema: writeInputSchema,
    execute: async (input) => {
      const targetPath = await writeFileContent(input.filePath, input.content);

      return { output: `Wrote file: ${targetPath}`, filePath: targetPath };
    },
  });
}

function getPatternTargets(input: unknown): string[] {
  return getFilePathPatternTargets(input);
}

function getSuggestion(input: unknown) {
  return getParentDirPermissionSuggestion(input);
}

export const definition: ToolDefinition = {
  name: 'write',
  displayName: 'Write',
  tool: createWriteTool(),
  permission: { getPatternTargets, getSuggestion },
};
