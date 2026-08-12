import type { SandboxLibrary } from './types.js';

type WorkerExecuteMessage = { type: 'execute'; code: string };

type WorkerToolResultMessage = { type: 'tool_result'; id: string; result: unknown };

type WorkerToolErrorMessage = { type: 'tool_error'; id: string; error: string };

type WorkerInitMessage = {
  type: 'init';
  toolNames: string[];
  libraries: Record<string, SandboxLibrary>;
  memoryReportIntervalMs: number;
};

export type HostMessage = WorkerExecuteMessage | WorkerToolResultMessage | WorkerToolErrorMessage | WorkerInitMessage;

type SandboxToolCallMessage = { type: 'tool_call'; id: string; name: string; args: unknown };

type SandboxCompleteMessage = { type: 'complete'; result: unknown; logs: string[] };

type SandboxErrorMessage = { type: 'error'; error: string; logs: string[] };

type SandboxMemoryReportMessage = { type: 'memory_report'; rss: number };

export type WorkerMessage =
  | SandboxToolCallMessage
  | SandboxCompleteMessage
  | SandboxErrorMessage
  | SandboxMemoryReportMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasUnknownField(value: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSandboxLibrary(value: unknown): value is SandboxLibrary {
  if (!isRecord(value) || typeof value['specifier'] !== 'string') return false;
  if (value['globalName'] !== undefined && typeof value['globalName'] !== 'string') return false;
  return value['inject'] === undefined || typeof value['inject'] === 'boolean';
}

function isLibraryRecord(value: unknown): value is Record<string, SandboxLibrary> {
  return isRecord(value) && Object.values(value).every(isSandboxLibrary);
}

export function isWorkerMessage(message: unknown): message is WorkerMessage {
  if (!isRecord(message)) return false;

  switch (message['type']) {
    case 'tool_call':
      return (
        typeof message['id'] === 'string' && typeof message['name'] === 'string' && hasUnknownField(message, 'args')
      );
    case 'complete':
      return hasUnknownField(message, 'result') && isStringArray(message['logs']);
    case 'error':
      return typeof message['error'] === 'string' && isStringArray(message['logs']);
    case 'memory_report':
      return typeof message['rss'] === 'number' && Number.isFinite(message['rss']) && message['rss'] >= 0;
    default:
      return false;
  }
}

export function isHostMessage(message: unknown): message is HostMessage {
  if (!isRecord(message)) return false;

  switch (message['type']) {
    case 'init':
      return (
        isStringArray(message['toolNames']) &&
        isLibraryRecord(message['libraries']) &&
        typeof message['memoryReportIntervalMs'] === 'number' &&
        Number.isFinite(message['memoryReportIntervalMs']) &&
        message['memoryReportIntervalMs'] > 0
      );
    case 'execute':
      return typeof message['code'] === 'string';
    case 'tool_result':
      return typeof message['id'] === 'string' && hasUnknownField(message, 'result');
    case 'tool_error':
      return typeof message['id'] === 'string' && typeof message['error'] === 'string';
    default:
      return false;
  }
}
