import { ToolError } from '@/tools/errors.js';

export class BrowserMissingFieldError extends ToolError {
  readonly field: string;
  readonly tool: string;
  constructor(tool: string, field: string) {
    super(`Missing required field: ${field} for tool ${tool}`);
    this.name = 'BrowserMissingFieldError';
    this.field = field;
    this.tool = tool;
  }
}

export class BrowserInvalidOpError extends ToolError {
  readonly op: string;
  readonly tool: string;
  constructor(tool: string, op: string) {
    super(`Invalid op for ${tool} tool: ${op}`);
    this.name = 'BrowserInvalidOpError';
    this.op = op;
    this.tool = tool;
  }
}
