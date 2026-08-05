import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, open, readFile, readdir, realpath, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import { PATHS } from '@/lib/paths.js';
import type {
  ManagedMemoryEntry,
  MemoryCapacity,
  MemoryFileName,
  MemoryFileSnapshot,
  MemoryMutation,
  MemoryOrigin,
  MemorySearchResult,
  MemoryTarget,
} from '@/memory/types.js';

const MEMORY_TEMPLATE = '# Long-term memory\n';
const USER_TEMPLATE = '# User profile\n';
const DREAMS_TEMPLATE = '# Consolidation log\n';

const CURATED_NAMES = { memory: 'MEMORY.md', user: 'USER.md' } as const;
const FILE_TEMPLATES: Record<MemoryFileName, string> = {
  'MEMORY.md': MEMORY_TEMPLATE,
  'USER.md': USER_TEMPLATE,
  'DREAMS.md': DREAMS_TEMPLATE,
};
const METADATA_PATTERN =
  /^<!-- stitch-memory id="([^"]+)" observed="(\d{4}-\d{2}-\d{2})" origin="(user|agent|automation|system)" source="([^"]*)"(?: target="(memory|user)")? -->$/;
const DAILY_PATH_PATTERN = /^daily\/(\d{4}-\d{2}-\d{2})\.md$/;

class MemoryStoreError extends Error {}

export class MemoryConflictError extends MemoryStoreError {}

class MemoryParseError extends MemoryConflictError {}

export class MemoryCapacityError extends MemoryStoreError {
  readonly capacity: MemoryCapacity;

  constructor(capacity: MemoryCapacity) {
    super(`Memory file exceeds its ${capacity.limit} character limit`);
    this.capacity = capacity;
  }
}

export class MemoryPathError extends MemoryStoreError {}

type ParsedDocument = { entries: ManagedMemoryEntry[]; modelContent: string };

type FileStoreOptions = { rootDir?: string; memoryCharLimit?: number; userCharLimit?: number; now?: () => Date };

type AddEntry = {
  content: string;
  origin: MemoryOrigin;
  source: string;
  target: MemoryTarget;
  id?: string;
  observed?: string;
};

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function visibleContent(content: string): string {
  return content
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('<!-- stitch-memory '))
    .join('\n');
}

function capacityFor(content: string, limit: number): MemoryCapacity {
  const used = visibleContent(content).length;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

function parseDocument(content: string, filePath: string, defaultTarget: MemoryTarget): ParsedDocument {
  const lines = content.split('\n');
  const entries: ManagedMemoryEntry[] = [];
  const ids = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.startsWith('<!-- stitch-memory ')) continue;

    const metadata = METADATA_PATTERN.exec(line);
    const item = lines[index + 1];
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
      origin: origin as MemoryOrigin,
      observed,
      source,
      target: (targetValue as MemoryTarget | undefined) ?? defaultTarget,
      filePath,
      lineStart: index + 1,
      lineEnd: endIndex + 1,
    });
    index = endIndex;
  }

  return { entries, modelContent: visibleContent(content) };
}

function serializeEntry(entry: AddEntry): string {
  const id = entry.id ?? `mem_${randomUUID().replaceAll('-', '')}`;
  const observed = entry.observed ?? new Date().toISOString().slice(0, 10);
  const target = ` target="${entry.target}"`;
  const escapedSource = entry.source.replaceAll('"', '&quot;');
  const content = entry.content.trim().replaceAll('\n', '\n  ');
  return `<!-- stitch-memory id="${id}" observed="${observed}" origin="${entry.origin}" source="${escapedSource}"${target} -->\n- ${content}`;
}

function replaceEntryBlock(raw: string, entry: ManagedMemoryEntry, replacement: string): string {
  const lines = raw.split('\n');
  lines.splice(entry.lineStart - 1, entry.lineEnd - entry.lineStart + 1, ...replacement.split('\n'));
  return lines.join('\n');
}

export class MemoryFileStore {
  readonly rootDir: string;
  readonly memoryCharLimit: number;
  readonly userCharLimit: number;
  private readonly now: () => Date;
  private readonly queues = new Map<string, Promise<void>>();

  constructor(options: FileStoreOptions = {}) {
    this.rootDir = path.resolve(options.rootDir ?? PATHS.dirPaths.memory);
    this.memoryCharLimit = options.memoryCharLimit ?? 8_000;
    this.userCharLimit = options.userCharLimit ?? 4_000;
    this.now = options.now ?? (() => new Date());
  }

  async ensureInitialized(): Promise<void> {
    await Promise.all([
      mkdir(path.join(this.rootDir, 'daily'), { recursive: true }),
      mkdir(path.join(this.rootDir, '.state'), { recursive: true }),
    ]);
    await Promise.all(
      Object.entries(FILE_TEMPLATES).map(async ([name, template]) => {
        let handle;
        try {
          handle = await open(path.join(this.rootDir, name), 'wx');
          await handle.writeFile(template, 'utf8');
          await handle.sync();
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        } finally {
          await handle?.close();
        }
      }),
    );
  }

  async readCurated(target: MemoryTarget): Promise<MemoryFileSnapshot> {
    return this.readFile(CURATED_NAMES[target]);
  }

  async readFile(relativePath: string): Promise<MemoryFileSnapshot> {
    await this.ensureInitialized();
    const absolutePath = await this.resolveAllowedPath(relativePath);
    const [rawContent, fileStat] = await Promise.all([readFile(absolutePath, 'utf8'), stat(absolutePath)]);
    const defaultTarget = relativePath === 'USER.md' ? 'user' : 'memory';
    const parsed = parseDocument(rawContent, relativePath.replaceAll('\\', '/'), defaultTarget);
    const limit =
      relativePath === 'MEMORY.md' ? this.memoryCharLimit : relativePath === 'USER.md' ? this.userCharLimit : null;

    return {
      name: relativePath as MemoryFileSnapshot['name'],
      path: absolutePath,
      rawContent,
      modelContent: parsed.modelContent,
      contentHash: hashContent(rawContent),
      mtime: fileStat.mtime.toISOString(),
      entries: parsed.entries,
      capacity: limit === null ? null : capacityFor(rawContent, limit),
      truncated: false,
    };
  }

  async mutate(target: MemoryTarget, operations: MemoryMutation[], expectedHash?: string): Promise<MemoryFileSnapshot> {
    return this.withFileLock(CURATED_NAMES[target], async () => {
      const before = await this.readCurated(target);
      if (expectedHash && before.contentHash !== expectedHash) {
        throw new MemoryConflictError(`${CURATED_NAMES[target]} changed outside Stitch`);
      }

      let raw = before.rawContent;
      for (const operation of operations) {
        const parsed = parseDocument(raw, CURATED_NAMES[target], target);
        if (operation.type === 'add') {
          const content = operation.content.trim();
          if (!content) throw new MemoryConflictError('Memory content cannot be empty');
          if (parsed.entries.some((entry) => entry.content.trim() === content)) {
            throw new MemoryConflictError('An exact duplicate memory entry already exists');
          }
          const block = serializeEntry({
            content,
            origin: operation.origin ?? 'user',
            source: operation.source ?? 'manual',
            target,
            observed: this.now().toISOString().slice(0, 10),
          });
          raw = `${raw.trimEnd()}\n\n${block}\n`;
          continue;
        }

        const matches = parsed.entries.filter((entry) => entry.content.includes(operation.oldText));
        if (matches.length !== 1) {
          throw new MemoryConflictError(
            matches.length === 0
              ? 'No memory entry uniquely matches oldText'
              : 'oldText matches multiple memory entries',
          );
        }
        const match = matches[0];
        if (!match) throw new MemoryConflictError('No memory entry uniquely matches oldText');
        if (operation.type === 'remove') {
          raw = replaceEntryBlock(raw, match, '').replace(/\n{3,}/g, '\n\n');
          continue;
        }

        const replacementContent = match.content.replace(operation.oldText, operation.content).trim();
        if (!replacementContent) throw new MemoryConflictError('Memory content cannot be empty');
        raw = replaceEntryBlock(
          raw,
          match,
          serializeEntry({ ...match, content: replacementContent, target, id: match.id }),
        );
      }

      this.assertCapacity(raw, target);
      await this.atomicWrite(path.join(this.rootDir, CURATED_NAMES[target]), raw);
      return this.readCurated(target);
    });
  }

  async writeRaw(name: 'MEMORY.md' | 'USER.md', content: string, expectedHash: string): Promise<MemoryFileSnapshot> {
    const target = name === 'USER.md' ? 'user' : 'memory';
    return this.withFileLock(name, async () => {
      const before = await this.readFile(name);
      if (before.contentHash !== expectedHash) throw new MemoryConflictError(`${name} changed outside Stitch`);
      parseDocument(content, name, target);
      this.assertCapacity(content, target);
      await this.atomicWrite(path.join(this.rootDir, name), content);
      return this.readFile(name);
    });
  }

  async appendDaily(entries: AddEntry[], date = this.now().toISOString().slice(0, 10)): Promise<MemoryFileSnapshot> {
    const relativePath = `daily/${date}.md`;
    return this.withFileLock(relativePath, async () => {
      await this.ensureInitialized();
      const absolutePath = path.join(this.rootDir, 'daily', `${date}.md`);
      let raw: string;
      try {
        raw = await readFile(absolutePath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        raw = `# Memory candidates for ${date}\n`;
      }
      const parsed = parseDocument(raw, relativePath, 'memory');
      const seen = new Set(parsed.entries.map((entry) => `${entry.target}\0${entry.content.trim()}`));
      const blocks = entries
        .filter((entry) => {
          const key = `${entry.target}\0${entry.content.trim()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((entry) => serializeEntry({ ...entry, observed: entry.observed ?? date }));
      if (blocks.length > 0) await this.atomicWrite(absolutePath, `${raw.trimEnd()}\n\n${blocks.join('\n\n')}\n`);
      return this.readFile(relativePath);
    });
  }

  async listDailyFiles(): Promise<string[]> {
    await this.ensureInitialized();
    const names = await readdir(path.join(this.rootDir, 'daily'));
    return names
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
      .toSorted()
      .reverse()
      .map((name) => `daily/${name}`);
  }

  async search(query: string, limit = 20): Promise<MemorySearchResult[]> {
    const terms = [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])];
    if (terms.length === 0) return [];
    const paths = ['USER.md', 'MEMORY.md', ...(await this.listDailyFiles())];
    const snapshots = await Promise.all(paths.map((filePath) => this.readFile(filePath)));
    const results: Array<MemorySearchResult & { score: number }> = [];

    for (const snapshot of snapshots) {
      for (const entry of snapshot.entries) {
        const haystack = entry.content.toLocaleLowerCase();
        const score = terms.filter((term) => haystack.includes(term)).length;
        if (score === 0) continue;
        results.push({
          filePath: entry.filePath,
          entryId: entry.id,
          observed: entry.observed,
          excerpt: entry.content.slice(0, 500),
          lineStart: entry.lineStart,
          lineEnd: entry.lineEnd,
          score,
        });
      }

      const managedLines = new Set(
        snapshot.entries.flatMap((entry) => {
          const lines: number[] = [];
          for (let line = entry.lineStart; line <= entry.lineEnd; line += 1) lines.push(line);
          return lines;
        }),
      );
      snapshot.rawContent.split('\n').forEach((line, index) => {
        const lineNumber = index + 1;
        const haystack = line.toLocaleLowerCase();
        const score = terms.filter((term) => haystack.includes(term)).length;
        if (score === 0 || managedLines.has(lineNumber)) return;
        results.push({
          filePath: snapshot.name,
          entryId: null,
          observed: DAILY_PATH_PATTERN.exec(snapshot.name)?.[1] ?? null,
          excerpt: line.slice(0, 500),
          lineStart: lineNumber,
          lineEnd: lineNumber,
          score,
        });
      });
    }

    return results
      .toSorted(
        (left, right) =>
          right.score - left.score || left.filePath.localeCompare(right.filePath) || left.lineStart - right.lineStart,
      )
      .slice(0, limit)
      .map(({ score: _score, ...result }) => result);
  }

  async readLines(
    relativePath: string,
    offset = 1,
    limit = 200,
  ): Promise<{ content: string; offset: number; nextOffset: number | null; truncated: boolean }> {
    const snapshot = await this.readFile(relativePath);
    const lines = snapshot.rawContent.split('\n');
    const start = Math.max(0, offset - 1);
    const selected = lines.slice(start, start + limit);
    const nextOffset = start + selected.length < lines.length ? start + selected.length + 1 : null;
    return {
      content: selected.map((line, index) => `${start + index + 1}: ${line}`).join('\n'),
      offset: start + 1,
      nextOffset,
      truncated: nextOffset !== null,
    };
  }

  private assertCapacity(content: string, target: MemoryTarget): void {
    const capacity = capacityFor(content, target === 'memory' ? this.memoryCharLimit : this.userCharLimit);
    if (capacity.used > capacity.limit) throw new MemoryCapacityError(capacity);
  }

  private async resolveAllowedPath(relativePath: string): Promise<string> {
    const normalized = relativePath.replaceAll('\\', '/');
    if (!(normalized in FILE_TEMPLATES) && !DAILY_PATH_PATTERN.test(normalized)) {
      throw new MemoryPathError(`Memory path is not readable: ${relativePath}`);
    }
    const absolutePath = path.resolve(this.rootDir, normalized);
    const relative = path.relative(this.rootDir, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative))
      throw new MemoryPathError('Memory path escapes the memory root');

    try {
      const [rootRealPath, fileRealPath] = await Promise.all([realpath(this.rootDir), realpath(absolutePath)]);
      const realRelative = path.relative(rootRealPath, fileRealPath);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        throw new MemoryPathError('Memory path resolves outside the memory root');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return absolutePath;
  }

  private async backupUnreadable(name: string, sourcePath: string): Promise<void> {
    const timestamp = this.now().toISOString().replaceAll(/[:.]/g, '-');
    const stateDir = path.join(this.rootDir, '.state');
    const prefix = `${path.parse(name).name}.`;
    await mkdir(stateDir, { recursive: true });
    await copyFile(sourcePath, path.join(stateDir, `${prefix}${timestamp}.bak.md`));
    const backups = (await readdir(stateDir))
      .filter((entry) => entry.startsWith(prefix) && entry.endsWith('.bak.md'))
      .toSorted()
      .reverse();
    await Promise.all(backups.slice(5).map((entry) => unlink(path.join(stateDir, entry))));
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, 'wx');
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporaryPath, filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  private async withFileLock<T>(name: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(name) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.queues.set(name, queued);
    await previous;
    try {
      return await action();
    } catch (error) {
      if (error instanceof MemoryParseError) {
        const sourcePath = path.join(this.rootDir, name);
        try {
          await this.backupUnreadable(name, sourcePath);
        } catch {
          // Preserve the original actionable conflict when no readable pre-image exists.
        }
      }
      throw error;
    } finally {
      release();
      if (this.queues.get(name) === queued) this.queues.delete(name);
    }
  }
}

export const memoryFileStore = new MemoryFileStore();
