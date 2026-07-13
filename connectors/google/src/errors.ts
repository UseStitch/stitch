class GoogleConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleConnectorError';
  }
}

export class ConnectorMissingCredentialsError extends GoogleConnectorError {
  constructor() {
    super('Connector has no credentials to test');
    this.name = 'ConnectorMissingCredentialsError';
  }
}

export class ConnectorApiError extends GoogleConnectorError {
  readonly status: number;
  constructor(status: number) {
    super(`Google API returned ${status}`);
    this.name = 'ConnectorApiError';
    this.status = status;
  }
}

export class SummaryResolverCalledError extends GoogleConnectorError {
  constructor() {
    super('Summary resolver should not be executed.');
    this.name = 'SummaryResolverCalledError';
  }
}

export class RateLimitExceedsCapacityError extends GoogleConnectorError {
  readonly weight: number;
  readonly capacity: number;
  readonly windowMs: number;
  constructor(weight: number, capacity: number, windowMs: number) {
    super(`Requested quota cost (${weight}) exceeds limiter capacity (${capacity}) for ${windowMs}ms window`);
    this.name = 'RateLimitExceedsCapacityError';
    this.weight = weight;
    this.capacity = capacity;
    this.windowMs = windowMs;
  }
}

export class RateLimitQueueTimeoutError extends GoogleConnectorError {
  readonly maxWaitMs: number;
  constructor(maxWaitMs: number) {
    super(`Rate limiter queue wait exceeded ${maxWaitMs}ms`);
    this.name = 'RateLimitQueueTimeoutError';
    this.maxWaitMs = maxWaitMs;
  }
}

export class GmailMissingTempPathError extends GoogleConnectorError {
  constructor() {
    super('Gmail attachment downloads require a configured temp path.');
    this.name = 'GmailMissingTempPathError';
  }
}

export class GmailAttachmentMissingDataError extends GoogleConnectorError {
  readonly attachmentId: string;
  constructor(attachmentId: string) {
    super(`Gmail attachment ${attachmentId} did not include download data`);
    this.name = 'GmailAttachmentMissingDataError';
    this.attachmentId = attachmentId;
  }
}

export class GmailFilterNoCriteriaError extends GoogleConnectorError {
  constructor() {
    super('A filter must have at least one criteria field (e.g. from, to, subject, query, hasAttachment).');
    this.name = 'GmailFilterNoCriteriaError';
  }
}

export class DocsEditNoMatchError extends GoogleConnectorError {
  constructor() {
    super('oldString not found in content');
    this.name = 'DocsEditNoMatchError';
  }
}

export class DocsEditMultipleMatchesError extends GoogleConnectorError {
  constructor() {
    super(
      'Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match.',
    );
    this.name = 'DocsEditMultipleMatchesError';
  }
}
