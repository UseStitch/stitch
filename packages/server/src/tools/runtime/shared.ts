import fs from 'node:fs/promises';
import path from 'node:path';

import { ToolFileTypeError, ToolPathValidationError } from '@/tools/errors.js';

const MAX_LINE_LENGTH = 2000;
const NON_PRINTABLE_RATIO_LIMIT = 0.3;

const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.a',
  '.avi',
  '.bin',
  '.bmp',
  '.class',
  '.dll',
  '.dmg',
  '.doc',
  '.docx',
  '.dylib',
  '.exe',
  '.gif',
  '.ico',
  '.iso',
  '.jar',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.o',
  '.obj',
  '.pdf',
  '.png',
  '.ppt',
  '.pptx',
  '.rar',
  '.so',
  '.wasm',
  '.webm',
  '.webp',
  '.xls',
  '.xlsx',
  '.zip',
]);

type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

function isMostlyPrintableText(value: string): boolean {
  if (value.length === 0) return true;

  let nonPrintable = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const isAllowedControl = code === 9 || code === 10 || code === 12 || code === 13;
    if (!isAllowedControl && code < 32) {
      nonPrintable++;
    }
  }

  return nonPrintable / value.length <= NON_PRINTABLE_RATIO_LIMIT;
}

export function isKnownBinaryFilePath(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function detectTextEncoding(buffer: Buffer): TextEncoding | null {
  if (buffer.length === 0) return 'utf-8';

  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return 'utf-16le';
    if (buffer[0] === 0xfe && buffer[1] === 0xff) return 'utf-16be';
  }

  let evenNulCount = 0;
  let oddNulCount = 0;
  const sampleLength = Math.min(buffer.length, 4096);

  for (let i = 0; i < sampleLength; i++) {
    if (buffer[i] !== 0) continue;
    if (i % 2 === 0) {
      evenNulCount++;
    } else {
      oddNulCount++;
    }
  }

  const nulThreshold = Math.max(4, Math.floor(sampleLength / 8));
  if (oddNulCount >= nulThreshold && evenNulCount === 0) return 'utf-16le';
  if (evenNulCount >= nulThreshold && oddNulCount === 0) return 'utf-16be';

  if (evenNulCount > 0 || oddNulCount > 0) return null;

  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (!isMostlyPrintableText(content)) return null;
    return 'utf-8';
  } catch {
    return null;
  }
}

export function isTextFileBuffer(buffer: Buffer): boolean {
  return detectTextEncoding(buffer) !== null;
}

export function decodeTextFileBuffer(buffer: Buffer): string {
  const encoding = detectTextEncoding(buffer);
  if (encoding === null) {
    throw new ToolFileTypeError();
  }

  if (encoding === 'utf-16be') {
    const swapped = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length; i += 2) {
      swapped[i] = buffer[i + 1] ?? 0;
      swapped[i + 1] = buffer[i];
    }
    const content = swapped.toString('utf16le');
    if (!isMostlyPrintableText(content)) throw new ToolFileTypeError();
    return content;
  }

  const content = encoding === 'utf-16le' ? buffer.toString('utf16le') : buffer.toString('utf8');
  if (!isMostlyPrintableText(content)) throw new ToolFileTypeError();
  return content;
}

export function validateAbsoluteFilePath(filePath: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new ToolPathValidationError(filePath, 'filePath must be an absolute path');
  }

  return path.resolve(filePath);
}

export function validateAbsoluteDirectoryPath(dirPath: string): string {
  if (!path.isAbsolute(dirPath)) {
    throw new ToolPathValidationError(dirPath, 'path must be an absolute directory path');
  }

  return path.resolve(dirPath);
}

export async function validateExistingDirectoryPath(dirPath: string): Promise<string> {
  const resolved = validateAbsoluteDirectoryPath(dirPath);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new ToolPathValidationError(dirPath, 'workdir must point to an existing directory');
  }

  return resolved;
}

export function truncateLine(value: string): string {
  if (value.length <= MAX_LINE_LENGTH) return value;
  return value.slice(0, MAX_LINE_LENGTH);
}
