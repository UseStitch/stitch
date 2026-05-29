export type WorkerExecuteMessage = {
  type: 'execute';
  code: string;
};

export type WorkerToolResultMessage = {
  type: 'tool_result';
  id: string;
  result: unknown;
};

export type WorkerToolErrorMessage = {
  type: 'tool_error';
  id: string;
  error: string;
};

export type HostMessage = WorkerExecuteMessage | WorkerToolResultMessage | WorkerToolErrorMessage;

export type SandboxToolCallMessage = {
  type: 'tool_call';
  id: string;
  name: string;
  args: unknown;
};

export type SandboxCompleteMessage = {
  type: 'complete';
  result: unknown;
  logs: string[];
};

export type SandboxErrorMessage = {
  type: 'error';
  error: string;
  logs: string[];
};

export type SandboxMemoryReportMessage = {
  type: 'memory_report';
  rss: number;
};

export type WorkerMessage =
  | SandboxToolCallMessage
  | SandboxCompleteMessage
  | SandboxErrorMessage
  | SandboxMemoryReportMessage;

export function isWorkerMessage(message: unknown): message is WorkerMessage {
  if (message === null || typeof message !== 'object') return false;
  const type = (message as { type?: unknown }).type;
  return (
    type === 'tool_call' || type === 'complete' || type === 'error' || type === 'memory_report'
  );
}
