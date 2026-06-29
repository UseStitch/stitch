import { getBrowserManager } from '@/lib/browser/browser-manager.js';
import type {
  BrowserTab,
  DropdownOptionsResult,
  ExtractContentResult,
  FindElementsResult,
  SearchPageResult,
} from '@/lib/browser/types.js';
import { serializeBrowserSnapshot } from '@/tools/toolsets/browser/snapshot-serializer.js';

export function formatTabsOutput(tabs: BrowserTab[]): string {
  const tabList = tabs
    .filter((t) => t.type === 'page')
    .map((t) => `  ${t.id}: ${t.title || '(untitled)'} - ${t.url}`)
    .join('\n');
  return `Open tabs:\n${tabList}`;
}

export function formatSearchPageSummary(pattern: string, result: SearchPageResult): string {
  const matchLines = result.matches.map((m, i) => `  ${i + 1}. "${m.match}" - ...${m.context}...`);
  const showing = result.matches.length;
  const total = result.total;
  if (total === 0) {
    return `No matches for "${pattern}".`;
  }
  return `Found ${total} match${total !== 1 ? 'es' : ''} for "${pattern}"${showing < total ? ` (showing ${showing})` : ''}:\n${matchLines.join('\n')}`;
}

export function formatFindElementsSummary(selector: string, result: FindElementsResult): string {
  const elemLines = result.elements.map((el, i) => {
    let line = `  ${i + 1}. <${el.tag}>`;
    if (el.text) line += ` "${el.text}"`;
    if (el.attributes && Object.keys(el.attributes).length > 0) {
      const attrStr = Object.entries(el.attributes)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      line += ` [${attrStr}]`;
    }
    return line;
  });
  const showing = result.elements.length;
  const total = result.total;
  if (total === 0) {
    return `No elements matching "${selector}".`;
  }
  return `Found ${total} element${total !== 1 ? 's' : ''} matching "${selector}"${showing < total ? ` (showing ${showing})` : ''}:\n${elemLines.join('\n')}`;
}

export function formatDropdownOptionsSummary(ref: string, result: DropdownOptionsResult): string {
  if (result.options.length === 0) {
    return `No dropdown options found for ${ref}.`;
  }

  const lines = result.options.map((option) => {
    const selected = option.selected ? ' selected' : '';
    const disabled = option.disabled ? ' disabled' : '';
    return `  ${option.index}. "${option.text}" value="${option.value}"${selected}${disabled}`;
  });
  return `Dropdown options for ${ref} (${result.type}):\n${lines.join('\n')}\nUse browser_interact action="select_dropdown" with text to choose one.`;
}

export function formatExtractContent(
  query: string | undefined,
  result: string | ExtractContentResult,
): string {
  if (typeof result === 'string') {
    return `### Extracted Content\n**Query:** ${query ?? 'page content'}\n\n${result}`;
  }

  const sections = [
    `### Extracted Content`,
    `**Query:** ${query ?? 'page content'}`,
    '',
    result.text,
  ];
  if (result.links) {
    sections.push('', `### Links`, JSON.stringify(result.links, null, 2));
  }
  if (result.images) {
    sections.push('', `### Images`, JSON.stringify(result.images, null, 2));
  }
  if (result.data) {
    sections.push('', `### Data`, JSON.stringify(result.data, null, 2));
  }
  return sections.join('\n');
}

export function summarizeOperationResult(result: unknown): string {
  if (!result || typeof result !== 'object' || !('output' in result)) {
    return summarizeValue(result);
  }
  return summarizeValue((result as { output: unknown }).output);
}

function summarizeValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

export async function withFreshSnapshot(
  result: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const browser = getBrowserManager();
  const snapshot = await browser.snapshot(signal);
  const compactSnapshot = serializeBrowserSnapshot(snapshot);
  const output =
    typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2);
  return {
    ...result,
    output: `${output}\n\n### Updated Snapshot\n${compactSnapshot.text}`,
    snapshot: compactSnapshot.text,
    snapshotFingerprint: compactSnapshot.fingerprint,
    snapshotOriginalChars: compactSnapshot.originalChars,
    snapshotTruncated: compactSnapshot.truncated,
  };
}
