export function toErrorMessage(error: unknown): string {
  return Error.isError(error) ? error.message : String(error);
}

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}
