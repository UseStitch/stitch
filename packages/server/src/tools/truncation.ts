import fs from 'node:fs/promises';
import path from 'node:path';

import { createToolResultId } from '@openwork/shared';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const log = Log.create({ name: 'truncation' });

type TruncateResult =
  | { content: string; truncated: false }
  | { content: string; truncated: true; outputPath: string };

interface TruncateOptions {
  maxLines?: number;
  maxBytes?: number;
}

export async function truncateOutput(
  text: string,
  options: TruncateOptions = {},
): Promise<TruncateResult> {
  const maxLines = options.maxLines ?? MAX_LINES;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const lines = text.split('\n');
  const totalBytes = Buffer.byteLength(text, 'utf-8');

  if (lines.length <= maxLines && totalBytes <= maxBytes) {
    return { content: text, truncated: false };
  }

  const out: string[] = [];
  let bytes = 0;
  let hitBytes = false;

  for (let i = 0; i < lines.length && i < maxLines; i++) {
    const size = Buffer.byteLength(lines[i], 'utf-8') + (i > 0 ? 1 : 0);
    if (bytes + size > maxBytes) {
      hitBytes = true;
      break;
    }
    out.push(lines[i]);
    bytes += size;
  }

  const removed = hitBytes ? totalBytes - bytes : lines.length - out.length;
  const unit = hitBytes ? 'bytes' : 'lines';
  const preview = out.join('\n');

  const id = createToolResultId();
  const outputPath = path.join(PATHS.dirPaths.toolOutput, id);
  await fs.mkdir(PATHS.dirPaths.toolOutput, { recursive: true });
  await fs.writeFile(outputPath, text, 'utf-8');
  log.info(`Truncated output saved to: ${outputPath}`);

  const hint = `The tool call succeeded but the output was truncated. Full output saved to: ${outputPath}\nUse Read with offset/limit to view specific sections or Grep to search the full content.`;
  const content = `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}`;

  return { content, truncated: true, outputPath };
}

export async function cleanup(): Promise<void> {
  const cutoff = Date.now() - RETENTION_MS;

  let entries: string[];
  try {
    entries = await fs.readdir(PATHS.dirPaths.toolOutput);
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.startsWith('toolres_'))
      .map(async (entry) => {
        const filePath = path.join(PATHS.dirPaths.toolOutput, entry);
        try {
          const stat = await fs.stat(filePath);
          if (stat.mtimeMs < cutoff) {
            await fs.unlink(filePath);
          }
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
          log.warn(`Failed to clean up file: ${filePath}`);
        }
      }),
  );
}
