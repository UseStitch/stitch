import { createHash } from 'node:crypto';

const DEFAULT_MAX_CHARS = 12_000;
const DEFAULT_MAX_ELEMENTS = 120;
const DEFAULT_TEXT_PER_LINE_CHARS = 220;

const METADATA_PREFIXES = ['URL:', 'Title:', 'Viewport:', 'Tabs:', 'Scroll:'];
const LOW_VALUE_PATTERNS = [
  /<script\b/i,
  /<style\b/i,
  /<noscript\b/i,
  /data:image\//i,
  /base64/i,
  /^\s*[{[]"(?:props|state|__|data|payload)/i,
];

type BrowserSnapshotSerializeOptions = { maxChars?: number; maxElements?: number; textPerLineChars?: number };

type SerializedBrowserSnapshot = {
  text: string;
  fingerprint: string;
  elementCount: number;
  truncated: boolean;
  originalChars: number;
};

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function isMetadataLine(line: string): boolean {
  return METADATA_PREFIXES.some((prefix) => line.startsWith(prefix));
}

function isInteractiveLine(line: string): boolean {
  return /\b(?:\[ref=e\d+\]|ref=e\d+|button|link|input|textarea|select|combobox|checkbox|menuitem|tab)\b/i.test(line);
}

function isLowValueLine(line: string): boolean {
  if (!line) return true;
  if (line.length > 2_000) return true;
  return LOW_VALUE_PATTERNS.some((pattern) => pattern.test(line));
}

function capLine(line: string, maxChars: number): string {
  if (line.length <= maxChars) return line;
  return `${line.slice(0, maxChars).trimEnd()}...`;
}

function uniquePush(lines: string[], seen: Set<string>, line: string): void {
  const key = line.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  lines.push(line);
}

function countRefs(lines: string[]): number {
  const refs = new Set<string>();
  for (const line of lines) {
    for (const match of line.matchAll(/\b(?:ref=)?(e\d+)\b/g)) {
      refs.add(match[1]);
    }
  }
  return refs.size;
}

function trimToBudget(lines: string[], maxChars: number): { text: string; truncated: boolean } {
  const kept: string[] = [];
  let chars = 0;
  let truncated = false;

  for (const line of lines) {
    const nextChars = chars + line.length + 1;
    if (nextChars > maxChars) {
      truncated = true;
      break;
    }
    kept.push(line);
    chars = nextChars;
  }

  if (truncated) {
    kept.push('[Snapshot truncated. Use browser_content for full page text.]');
  }

  return { text: kept.join('\n'), truncated };
}

export function serializeBrowserSnapshot(
  snapshot: string,
  options: BrowserSnapshotSerializeOptions = {},
): SerializedBrowserSnapshot {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const maxElements = options.maxElements ?? DEFAULT_MAX_ELEMENTS;
  const textPerLineChars = options.textPerLineChars ?? DEFAULT_TEXT_PER_LINE_CHARS;
  const originalChars = snapshot.length;
  const fingerprint = createHash('sha256').update(snapshot).digest('hex').slice(0, 12);

  const metadata: string[] = [];
  const interactive: string[] = [];
  const text: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of snapshot.split(/\r?\n/)) {
    const line = normalizeLine(rawLine);
    if (isLowValueLine(line)) continue;

    const capped = capLine(line, textPerLineChars);
    if (isMetadataLine(capped)) {
      uniquePush(metadata, seen, capped);
      continue;
    }

    if (isInteractiveLine(capped)) {
      if (interactive.length < maxElements) {
        uniquePush(interactive, seen, capped);
      }
      continue;
    }

    if (text.length < maxElements) {
      uniquePush(text, seen, capped);
    }
  }

  const sections = [
    ...metadata,
    `Fingerprint: ${fingerprint}`,
    '',
    'Interactive Elements:',
    ...(interactive.length > 0 ? interactive : ['(none visible)']),
    '',
    'Visible Text:',
    ...(text.length > 0 ? text : ['(none captured)']),
  ];

  const result = trimToBudget(sections, maxChars);

  return {
    text: result.text,
    fingerprint,
    elementCount: countRefs(interactive),
    truncated: result.truncated || originalChars > result.text.length,
    originalChars,
  };
}
