import { z } from 'zod';

import type {
  ElectronBrowserDropdownOptionsResult,
  ElectronBrowserExtractContentResult,
  ElectronBrowserFindElementsResult,
  ElectronBrowserSearchPageResult,
} from '@stitch/shared/browser/electron';

import { sendBrowserCommand } from '@/lib/browser/browser-manager.js';
import type { BrowserTab } from '@/lib/browser/types.js';
import {
  serializeBrowserSnapshot,
  type SerializedBrowserSnapshot,
} from '@/tools/toolsets/browser/snapshot-serializer.js';

const stringSchema = z.string();
const operationResultSchema = z.looseObject({ output: z.unknown() });
const extractContentResultSchema = z.object({
  text: z.string(),
  links: z.array(z.object({ text: z.string(), href: z.string() })).optional(),
  images: z.array(z.object({ alt: z.string(), src: z.string() })).optional(),
  data: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
});

export function formatTabsOutput(tabs: BrowserTab[]): string {
  const tabList = tabs
    .values()
    .filter((t) => t.type === 'page')
    .map((t) => `  ${t.id}: ${t.title || '(untitled)'} - ${t.url}`)
    .toArray()
    .join('\n');
  return `Open tabs:\n${tabList}`;
}

export function formatSearchPageSummary(pattern: string, result: ElectronBrowserSearchPageResult): string {
  const matchLines = result.matches.map((m, i) => `  ${i + 1}. "${m.match}" - ...${m.context}...`);
  const showing = result.matches.length;
  const total = result.total;
  if (total === 0) {
    return `No matches for "${pattern}".`;
  }
  return `Found ${total} match${total !== 1 ? 'es' : ''} for "${pattern}"${showing < total ? ` (showing ${showing})` : ''}:\n${matchLines.join('\n')}`;
}

export function formatFindElementsSummary(selector: string, result: ElectronBrowserFindElementsResult): string {
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

export function formatDropdownOptionsSummary(ref: string, result: ElectronBrowserDropdownOptionsResult): string {
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
  result: string | ElectronBrowserExtractContentResult,
): string {
  const parsedResult = stringSchema.safeParse(result);
  if (parsedResult.success) {
    return `### Extracted Content\n**Query:** ${query ?? 'page content'}\n\n${parsedResult.data}`;
  }

  const content = extractContentResultSchema.parse(result);
  const sections = [`### Extracted Content`, `**Query:** ${query ?? 'page content'}`, '', content.text];
  if (content.links) {
    sections.push('', `### Links`, JSON.stringify(content.links, null, 2));
  }
  if (content.images) {
    sections.push('', `### Images`, JSON.stringify(content.images, null, 2));
  }
  if (content.data) {
    sections.push('', `### Data`, JSON.stringify(content.data, null, 2));
  }
  return sections.join('\n');
}

export function summarizeOperationResult(result: unknown): string {
  const parsedResult = operationResultSchema.safeParse(result);
  if (!parsedResult.success) {
    return summarizeValue(result);
  }
  return summarizeValue(parsedResult.data.output);
}

function summarizeValue(value: unknown): string {
  const parsedValue = stringSchema.safeParse(value);
  const text = parsedValue.success ? parsedValue.data : JSON.stringify(value);
  if (!text) return '';
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

export function snapshotFields(compact?: SerializedBrowserSnapshot | null) {
  return {
    snapshot: compact?.text,
    snapshotFingerprint: compact?.fingerprint,
    snapshotOriginalChars: compact?.originalChars,
    snapshotTruncated: compact?.truncated,
  };
}

export async function withFreshSnapshot(
  result: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const snapshot = await sendBrowserCommand({ action: 'snapshot' }, signal);
  const compactSnapshot = serializeBrowserSnapshot(snapshot);
  const parsedOutput = stringSchema.safeParse(result.output);
  const output = parsedOutput.success ? parsedOutput.data : JSON.stringify(result.output, null, 2);
  return {
    ...result,
    output: `${output}\n\n### Updated Snapshot\n${compactSnapshot.text}`,
    ...snapshotFields(compactSnapshot),
  };
}
