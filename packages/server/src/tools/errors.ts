class ToolError extends Error {
  readonly toolName?: string;
  constructor(message: string, toolName?: string) {
    super(message);
    this.name = 'ToolError';
    this.toolName = toolName;
  }
}

export { ToolError };

export class ToolValidationError extends ToolError {
  readonly field?: string;
  constructor(message: string, toolName?: string, field?: string) {
    super(message, toolName);
    this.name = 'ToolValidationError';
    this.field = field;
  }
}

export class ToolFileTypeError extends ToolError {
  readonly filePath?: string;
  constructor(filePath?: string) {
    super('Only text files are supported');
    this.name = 'ToolFileTypeError';
    this.filePath = filePath;
  }
}

export class ToolPathValidationError extends ToolError {
  readonly path: string;
  readonly reason: string;
  constructor(path: string, reason: string) {
    super(reason);
    this.name = 'ToolPathValidationError';
    this.path = path;
    this.reason = reason;
  }
}

export class ToolEditNoMatchError extends ToolError {
  constructor() {
    super('oldString not found in content');
    this.name = 'ToolEditNoMatchError';
  }
}

export class ToolEditMultipleMatchesError extends ToolError {
  constructor() {
    super(
      'Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match.',
    );
    this.name = 'ToolEditMultipleMatchesError';
  }
}

export class ToolsetNotFoundError extends ToolError {
  readonly toolsetId: string;
  constructor(toolsetId: string) {
    super(`Unknown toolset: "${toolsetId}". Use list_toolsets with no arguments to see available IDs.`);
    this.name = 'ToolsetNotFoundError';
    this.toolsetId = toolsetId;
  }
}

export class ToolsetDisabledError extends ToolError {
  readonly toolsetId: string;
  constructor(toolsetId: string) {
    super(
      `Toolset "${toolsetId}" has been disabled by the user. Do not attempt to activate it or search for alternatives.`,
    );
    this.name = 'ToolsetDisabledError';
    this.toolsetId = toolsetId;
  }
}

export class ToolsetNotInCatalogError extends ToolError {
  readonly toolsetId: string;
  constructor(toolsetId: string) {
    super(`Toolset "${toolsetId}" is not in the catalog. Use list_toolsets with no arguments to see available IDs.`);
    this.name = 'ToolsetNotInCatalogError';
    this.toolsetId = toolsetId;
  }
}

export class WebFetchUrlValidationError extends ToolError {
  readonly url: string;
  constructor(url: string) {
    super('URL must start with http:// or https://');
    this.name = 'WebFetchUrlValidationError';
    this.url = url;
  }
}

export class WebFetchHttpError extends ToolError {
  readonly statusCode: number;
  readonly url: string;
  constructor(url: string, statusCode: number) {
    super(`Request failed with status code: ${statusCode}`);
    this.name = 'WebFetchHttpError';
    this.statusCode = statusCode;
    this.url = url;
  }
}

export class WebFetchResponseTooLargeError extends ToolError {
  readonly url: string;
  readonly limitBytes: number;
  constructor(url: string, limitBytes: number = 5 * 1024 * 1024) {
    super('Response too large (exceeds 5MB limit)');
    this.name = 'WebFetchResponseTooLargeError';
    this.url = url;
    this.limitBytes = limitBytes;
  }
}
