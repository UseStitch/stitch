class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

export class HistoryMessagesEmptyError extends LlmError {
  constructor() {
    super('buildHistoryMessages requires at least one message');
    this.name = 'HistoryMessagesEmptyError';
  }
}

export class CompactionModelNotFoundError extends LlmError {
  constructor() {
    super('No configured provider found for compaction');
    this.name = 'CompactionModelNotFoundError';
  }
}
