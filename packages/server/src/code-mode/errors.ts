class CodeModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodeModeError';
  }
}

export class SandboxExecPathMissingError extends CodeModeError {
  constructor() {
    super(
      'SANDBOX_EXEC_PATH environment variable is required. Set it to the path of the compiled sandbox process binary.',
    );
    this.name = 'SandboxExecPathMissingError';
  }
}
