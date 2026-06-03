import type { StoredPart } from '@stitch/shared/chat/messages';
import type { ToolCallStatus } from '@stitch/shared/chat/realtime';
import { parseMcpToolName } from '@stitch/shared/mcp/types';

import { formatToolDisplayName, truncateText } from './tool-call/card-primitives';

import { getToolIconKind, type ToolIconKind } from '@/components/tools/tool-icons';
import type { StreamingPart } from '@/stores/stream-store';

const GOOGLE_SERVICE_ICON_SLUGS = {
  gmail: 'gmail',
  drive: 'googledrive',
  docs: 'googledocs',
  sheets: 'googlesheets',
  calendar: 'googlecalendar',
} as const;

type ToolSummaryKind = ToolIconKind;

export type ToolCallDisplayItem = {
  id: string;
  toolName: string;
  status: ToolCallStatus;
  args?: unknown;
  result?: unknown;
  error?: string;
};

export type ToolCallSummary = {
  kind: ToolSummaryKind;
  label: string;
  preview: string;
  meta?: string;
  connectorIconSlug: string | null;
  mcpServerId: string | null;
};

export type ToolCallAction = { type: 'open-child-session'; sessionId: string };

type StoredToolResult = StoredPart & { type: 'tool-result' };

export function buildStoredToolCallDisplayItems(
  parts: StoredPart[],
  resultsByCallId: Map<string, StoredToolResult>,
  wasAborted: boolean,
): ToolCallDisplayItem[] {
  return parts.filter(isVisibleStoredToolCallPart).map((part) => {
    const result = resultsByCallId.get(part.toolCallId);
    const output = result && 'output' in result ? result.output : undefined;
    const isError = isToolResultError(output);
    const missingResult = !result;
    const status = missingResult || isError ? 'error' : 'completed';

    let toolError: string | undefined;
    if (isError) {
      const rawError = (output as { error?: unknown }).error;
      toolError = typeof rawError === 'string' ? rawError : String(rawError);
    } else if (missingResult) {
      toolError = wasAborted ? 'Interrupted' : 'Blocked or failed before completion';
    }

    return {
      id: part.toolCallId,
      toolName: part.toolName,
      status,
      args: part.input,
      result: output,
      error: toolError,
    };
  });
}

export function buildStreamingToolCallDisplayItems(
  partIds: string[],
  parts: Record<string, StreamingPart>,
): ToolCallDisplayItem[] {
  return partIds.flatMap((partId) => {
    const part = parts[partId];
    if (!part || part.type !== 'tool-call' || part.toolName === 'todo') return [];

    return [
      {
        id: part.toolCallId,
        toolName: part.toolName,
        status: part.status,
        args: part.input,
        result: part.output,
        error: part.error ?? undefined,
      },
    ];
  });
}

export function getToolSummary(
  call: ToolCallDisplayItem,
  displayName: string,
): ToolCallSummary {
  const kind = getToolKind(call.toolName);
  const label = getToolLabel(call.toolName, displayName, kind);
  const preview = getToolPreview(call, kind);
  const meta = getToolMeta(call);
  const connectorIconSlug = getConnectorIconSlug(call.toolName);
  const mcpServerId = parseMcpToolName(call.toolName)?.serverId ?? null;

  return { kind, label, preview, meta, connectorIconSlug, mcpServerId };
}

export function getToolCallActions(call: ToolCallDisplayItem): ToolCallAction[] {
  const childSessionId = getChildSessionId(call.result);
  return childSessionId ? [{ type: 'open-child-session', sessionId: childSessionId }] : [];
}

function isVisibleStoredToolCallPart(part: StoredPart): part is StoredPart & {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
} {
  return part.type === 'tool-call' && part.toolName !== 'todo';
}

function isToolResultError(output: unknown): boolean {
  return (
    output !== null &&
    output !== undefined &&
    typeof output === 'object' &&
    ('error' in output || (output as { failed?: unknown }).failed === true)
  );
}

function getChildSessionId(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const id = (result as Record<string, unknown>).childSessionId;
  return typeof id === 'string' ? id : null;
}

function getToolKind(toolName: string): ToolSummaryKind {
  if (parseMcpToolName(toolName)) return 'mcp';
  return getToolIconKind(toolName);
}

function getToolLabel(toolName: string, displayName: string, kind: ToolSummaryKind): string {
  if (toolName === 'gmail_download_attachments') return 'Gmail Attachments';

  if (kind === 'mcp') {
    const parsed = parseMcpToolName(toolName);
    return parsed ? formatToolDisplayName(parsed.toolName) : displayName;
  }

  if (toolName === 'execute_typescript') return 'Code';
  return displayName;
}

function getConnectorIconSlug(toolName: string): string | null {
  const service = toolName.split('_', 1)[0];
  if (!service) return null;
  return GOOGLE_SERVICE_ICON_SLUGS[service as keyof typeof GOOGLE_SERVICE_ICON_SLUGS] ?? null;
}

function getToolPreview(call: ToolCallDisplayItem, kind: ToolSummaryKind): string {
  if (call.error) return truncateText(call.error, 96);

  for (const getPreview of [getToolsetPreview, getGmailPreview, getSkillPreview]) {
    const preview = getPreview(call);
    if (preview) return preview;
  }

  switch (kind) {
    case 'bash':
      return getStringArg(call.args, ['description', 'command', 'code']) ?? 'Running command';
    case 'read':
      return getStringArg(call.args, ['filePath', 'path']) ?? 'Waiting for path';
    case 'edit':
      return getStringArg(call.args, ['filePath', 'path']) ?? 'Editing file';
    case 'write':
      return getStringArg(call.args, ['filePath', 'path']) ?? 'Writing file';
    case 'search':
      return getStringArg(call.args, ['query', 'pattern', 'q']) ?? 'Searching';
    case 'web':
      return getStringArg(call.args, ['url', 'target', 'action']) ?? 'Using browser';
    case 'task':
      return getStringArg(call.args, ['description', 'prompt', 'command']) ?? 'Running subagent';
    case 'question':
      return getStringArg(call.args, ['question', 'header']) ?? 'Waiting for response';
    case 'skill':
      return 'Loading skill';
    case 'memory':
      return getStringArg(call.args, ['action', 'content']) ?? 'Using memory';
    case 'todo':
      return getStringArg(call.args, ['action']) ?? 'Updating todos';
    case 'agenda':
      return getBestGenericPreview(call.args, call.result) ?? 'Using agenda';
    case 'browser':
      return getStringArg(call.args, ['url', 'action', 'ref']) ?? 'Using browser';
    case 'recordings':
      return getBestGenericPreview(call.args, call.result) ?? 'Using recordings';
    case 'session-history':
      return getBestGenericPreview(call.args, call.result) ?? 'Searching sessions';
    case 'inspect-image':
      return getStringArg(call.args, ['prompt', 'imagePath']) ?? 'Inspecting image';
    case 'mcp':
    case 'generic':
      return getBestGenericPreview(call.args, call.result) ?? 'Using tool';
  }
}

function getSkillPreview(call: ToolCallDisplayItem): string | null {
  if (call.toolName !== 'skill') return null;

  if (call.status === 'pending' || call.status === 'in-progress') {
    return 'Loading skill';
  }

  return 'Reading skill';
}

function getToolsetPreview(call: ToolCallDisplayItem): string | null {
  if (!isToolsetTool(call.toolName)) return null;

  const toolsetName =
    getStringArg(call.result, ['toolsetName', 'name']) ?? getStringArg(call.args, ['toolsetId']);
  const normalizedName = toolsetName ?? 'toolset';

  if (call.toolName === 'list_toolsets') {
    const toolsets = getArrayLength(call.result, 'toolsets');
    if (toolsets !== null) return `${toolsets} available toolsets`;

    const query = getStringArg(call.args, ['query']);
    return query ? `Find toolsets matching ${query}` : 'Review available toolsets';
  }

  if (call.toolName === 'activate_toolset') {
    if (call.status === 'pending' || call.status === 'in-progress') {
      return `Activating ${normalizedName}`;
    }

    const tools = getArrayLength(call.result, 'tools');
    const suffix = tools !== null ? ` with ${tools} tools` : '';
    return `Activated ${normalizedName}${suffix}`;
  }

  if (call.toolName === 'deactivate_toolset') {
    if (call.status === 'pending' || call.status === 'in-progress') {
      return `Deactivating ${normalizedName}`;
    }
    return `Removed ${normalizedName} tools`;
  }

  return null;
}

function getGmailPreview(call: ToolCallDisplayItem): string | null {
  if (call.toolName === 'gmail_download_attachments') {
    const attachments = getArrayLength(call.result, 'attachments');
    if (attachments !== null) {
      return attachments === 0
        ? 'No attachments found'
        : `Downloaded ${attachments} attachment${attachments === 1 ? '' : 's'}`;
    }

    const messageId = getStringArg(call.args, ['messageId']);
    return messageId ? `Download attachments from message ${messageId}` : 'Download attachments';
  }

  if (call.toolName === 'gmail_read') {
    const subject = getStringArg(call.result, ['subject']);
    if (subject) return subject;

    const messageId = getStringArg(call.args, ['messageId']);
    return messageId ? `Read message ${messageId}` : 'Read message';
  }

  return null;
}

function isToolsetTool(toolName: string): boolean {
  return (
    toolName === 'list_toolsets' ||
    toolName === 'activate_toolset' ||
    toolName === 'deactivate_toolset'
  );
}

function getArrayLength(value: unknown, key: string): number | null {
  if (!value || typeof value !== 'object') return null;
  const raw = (value as Record<string, unknown>)[key];
  return Array.isArray(raw) ? raw.length : null;
}

function getToolMeta(call: ToolCallDisplayItem): string | undefined {
  if (call.status === 'error') return undefined;

  if (call.toolName === 'skill') {
    return getStringArg(call.args, ['name', 'skill']) ?? undefined;
  }

  const exitCode = (call.result as { metadata?: { exit?: unknown } } | undefined)?.metadata?.exit;
  if (typeof exitCode === 'number' && exitCode !== 0) return `exit ${exitCode}`;

  const usedAccount =
    getStringArg(call.args, ['account']) ?? getStringArg(call.result, ['usedAccount', 'account']);
  return usedAccount ?? undefined;
}

function getBestGenericPreview(args: unknown, result: unknown): string | null {
  return (
    getStringArg(args, ['description', 'query', 'title', 'name', 'id']) ??
    getStringArg(result, ['title', 'name', 'id'])
  );
}

function getStringArg(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === 'string' && raw.trim().length > 0) return truncateText(raw.trim(), 120);
  }

  return null;
}
