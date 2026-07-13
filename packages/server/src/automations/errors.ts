class AutomationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutomationError';
  }
}

export class AutomationCallbackError extends AutomationError {
  readonly automationId?: string;
  constructor(message: string, automationId?: string) {
    super(message);
    this.name = 'AutomationCallbackError';
    this.automationId = automationId;
  }
}

export class AutomationSyncError extends AutomationError {
  constructor(message: string) {
    super(message);
    this.name = 'AutomationSyncError';
  }
}
