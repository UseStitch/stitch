import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_LINE_LENGTH = 2000;

export function isTextFileBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  if (buffer.includes(0)) return false;

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

export function validateAbsoluteFilePath(filePath: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new Error('filePath must be an absolute path');
  }

  return path.resolve(filePath);
}

export function validateAbsoluteDirectoryPath(dirPath: string): string {
  if (!path.isAbsolute(dirPath)) {
    throw new Error('path must be an absolute directory path');
  }

  return path.resolve(dirPath);
}

export async function validateExistingDirectoryPath(dirPath: string): Promise<string> {
  const resolved = validateAbsoluteDirectoryPath(dirPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error('workdir must point to an existing directory');
  }

  return resolved;
}

export function truncateLine(value: string): string {
  if (value.length <= MAX_LINE_LENGTH) return value;
  return `${value.slice(0, MAX_LINE_LENGTH)}...`;
}
