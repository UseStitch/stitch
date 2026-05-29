export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

export class SandboxTimeoutError extends SandboxError {
  constructor(timeoutMs: number) {
    super(`Execution timed out after ${timeoutMs}ms`);
    this.name = 'SandboxTimeoutError';
  }
}

export class SandboxAbsoluteTimeoutError extends SandboxError {
  constructor(timeoutMs: number) {
    super(`Sandbox execution exceeded absolute limit of ${timeoutMs}ms`);
    this.name = 'SandboxAbsoluteTimeoutError';
  }
}

export class SandboxAbortError extends SandboxError {
  constructor(message = 'Sandbox execution aborted') {
    super(message);
    this.name = 'SandboxAbortError';
  }
}

export class SandboxMessageTooLargeError extends SandboxError {
  constructor(maxMessageBytes: number) {
    super(`Sandbox message exceeded ${maxMessageBytes} bytes`);
    this.name = 'SandboxMessageTooLargeError';
  }
}

export class SandboxSecurityError extends SandboxError {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxSecurityError';
  }
}

export class SandboxToolError extends SandboxError {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxToolError';
  }
}

export class SandboxToolLimitError extends SandboxError {
  constructor(maxToolCalls: number) {
    super(`Exceeded maximum tool calls (${maxToolCalls})`);
    this.name = 'SandboxToolLimitError';
  }
}

export class SandboxUnknownToolError extends SandboxError {
  constructor(name: string) {
    super(`Unknown tool: ${name}`);
    this.name = 'SandboxUnknownToolError';
  }
}

export class SandboxMemoryError extends SandboxError {
  constructor(limitMB: number) {
    super(`Sandbox memory limit exceeded (${limitMB}MB)`);
    this.name = 'SandboxMemoryError';
  }
}
