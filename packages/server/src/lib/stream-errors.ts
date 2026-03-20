type StreamErrorCode =
  | 'STREAM_ABORTED'
  | 'PERMISSION_REJECTED'
  | 'PERMISSION_RESPONSE_ABORTED'
  | 'QUESTION_ABORTED'
  | 'CONTEXT_OVERFLOW'
  | 'STREAM_PROTOCOL_VIOLATION'
  | 'STREAM_PART_ERROR';

class StreamControlError extends Error {
  readonly code: StreamErrorCode;

  constructor(code: StreamErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class StreamAbortedError extends StreamControlError {
  constructor(message = 'Stream aborted', options?: ErrorOptions) {
    super('STREAM_ABORTED', message, options);
  }
}

export class PermissionRejectedError extends StreamControlError {
  readonly toolName: string;

  constructor(toolName: string, options?: ErrorOptions) {
    super('PERMISSION_REJECTED', `User rejected tool execution for ${toolName}`, options);
    this.toolName = toolName;
  }
}

export class PermissionResponseAbortedError extends StreamControlError {
  constructor(message = 'Permission response aborted', options?: ErrorOptions) {
    super('PERMISSION_RESPONSE_ABORTED', message, options);
  }
}

export class QuestionAbortedError extends StreamControlError {
  constructor(message = 'Question aborted', options?: ErrorOptions) {
    super('QUESTION_ABORTED', message, options);
  }
}

export class ContextOverflowError extends StreamControlError {
  constructor(message = 'context_overflow', options?: ErrorOptions) {
    super('CONTEXT_OVERFLOW', message, options);
  }
}

export class StreamProtocolViolationError extends StreamControlError {
  constructor(message: string, options?: ErrorOptions) {
    super('STREAM_PROTOCOL_VIOLATION', message, options);
  }
}

export class StreamPartError extends StreamControlError {
  constructor(message = 'stream part error', options?: ErrorOptions) {
    super('STREAM_PART_ERROR', message, options);
  }
}


export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof StreamControlError) {
    return error.code;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'STREAM_ABORTED';
  }

  return undefined;
}

export function isStreamAbortedError(error: unknown): boolean {
  return (
    error instanceof StreamAbortedError ||
    error instanceof PermissionResponseAbortedError ||
    error instanceof QuestionAbortedError ||
    (error instanceof DOMException && error.name === 'AbortError')
  );
}

export function isPermissionRejectedError(error: unknown): boolean {
  return error instanceof PermissionRejectedError;
}

export function isContextOverflowError(error: unknown): boolean {
  return error instanceof ContextOverflowError;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
