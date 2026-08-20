import { tool } from 'ai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import type { StoredPart } from '@stitch/shared/chat/messages';
import { createPartId } from '@stitch/shared/id';
import { toolError } from '@stitch/shared/tools/types';

import { runChildSession, type ChildSessionDeps } from '@/tools/core/child-session.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const DESCRIPTION = `Inspect an image using vision capabilities. Reads a local image file and sends it to the LLM with a prompt describing what to analyze.

Use this tool when you need to:
- Understand the contents of a screenshot, diagram, or photo
- Extract text or data from an image (OCR)
- Analyze UI mockups, charts, or visual layouts
- Compare visual elements or identify patterns

The image is sent to a child session with vision capabilities. Returns the LLM's analysis as a summary.

Supported formats: PNG, JPG, JPEG, GIF, WEBP, SVG, BMP.`;

export function createInspectImageTool(context: ToolContext, deps: ChildSessionDeps) {
  return tool({
    description: DESCRIPTION,
    inputSchema: z.object({
      imagePath: z.string().describe('Absolute path to the image file to inspect'),
      prompt: z.string().describe('What to analyze or look for in the image'),
    }),
    execute: async ({ imagePath, prompt }, { toolCallId }) => {
      const ext = path.extname(imagePath).toLowerCase();
      const mime = MIME_MAP[ext];
      if (!mime) {
        return toolError(`Unsupported image format "${ext}". Supported: ${Object.keys(MIME_MAP).join(', ')}`);
      }

      let stat;
      try {
        stat = await fs.stat(imagePath);
      } catch {
        return toolError(`Image file not found: ${imagePath}`);
      }

      if (stat.size > MAX_FILE_SIZE) {
        return toolError(
          `Image file too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum supported size is 20MB.`,
        );
      }

      const buffer = await fs.readFile(imagePath);
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${mime};base64,${base64}`;

      const filename = path.basename(imagePath);
      const sessionTitle = `Inspect: ${filename}`.slice(0, 50);
      const now = Date.now();

      const parts: StoredPart[] = [
        { type: 'text-delta', id: createPartId(), text: prompt, startedAt: now, endedAt: now },
        { type: 'user-image', id: createPartId(), dataUrl, mime, filename, startedAt: now, endedAt: now },
      ];

      return runChildSession(context, deps, { toolCallId, toolName: 'inspect_image', title: sessionTitle, parts });
    },
  });
}
