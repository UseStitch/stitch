import type {
  ManagedMemoryEntry,
  MemoryTarget,
} from '@stitch/shared/memory/types';

import { MemoryParseError } from './file-store.js';

const METADATA_PATTERN =
  /^<!-- stitch-memory id="([^"]+)" observed="(\d{4}-\d{2}-\d{2})" origin="(user|agent|automation|system)" source="([^"]*)"(?: target="(memory|user)")? -->$/;

export type ParsedDocument = { entries: ManagedMemoryEntry[]; modelContent: string };

export class MemoryParser {
  parseDocument(content: string, filePath: string, defaultTarget: MemoryTarget): ParsedDocument {
    const lines = content.split('\n');
    const entries: ManagedMemoryEntry[] = [];
    const ids = new Set<string>();

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (!line.startsWith('<!-- stitch-memory ')) continue;

      const metadata = METADATA_PATTERN.exec(line);
      const item = lines[index + 1] as string | undefined;
      if (!metadata || !item?.startsWith('- ')) {
        throw new MemoryParseError(`Managed memory block is malformed at ${filePath}:${index + 1}`);
      }

      const [, id = '', observed = '', origin = 'system', source = '', targetValue] = metadata;
      if (ids.has(id)) throw new MemoryParseError(`Duplicate memory entry id: ${id}`);
      ids.add(id);

      let endIndex = index + 1;
      const contentLines = [item.slice(2)];
      while (endIndex + 1 < lines.length && /^(?: {2,}|\t)/.test(lines[endIndex + 1] ?? '')) {
        endIndex += 1;
        contentLines.push((lines[endIndex] ?? '').replace(/^(?: {2}|\t)/, ''));
      }

      entries.push({
        id,
        content: contentLines.join('\n'),
        origin: origin as import('@stitch/shared/memory/types').MemoryOrigin,
        observed,
        source,
        target: (targetValue as MemoryTarget | undefined) ?? defaultTarget,
        filePath,
        lineStart: index + 1,
        lineEnd: endIndex + 1,
      });
      index = endIndex;
    }

    return { entries, modelContent: this.visibleContent(content) };
  }

  private visibleContent(content: string): string {
    return content
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('<!-- stitch-memory '))
      .join('\n');
  }
}
