class LibError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibError';
  }
}

export class UnsafeFilenameError extends LibError {
  readonly filename: string;
  constructor(filename: string) {
    super(`Unsafe filename: ${JSON.stringify(filename)}`);
    this.name = 'UnsafeFilenameError';
    this.filename = filename;
  }
}

export class RegistryCacheHttpError extends LibError {
  readonly statusCode: number;
  constructor(statusCode: number) {
    super(`HTTP ${statusCode}`);
    this.name = 'RegistryCacheHttpError';
    this.statusCode = statusCode;
  }
}
