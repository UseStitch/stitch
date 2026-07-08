import type { MailProviderId } from './db/schema.js';

class MailError extends Error {
  constructor(
    message: string,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class MailConfigurationError extends MailError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'mail_configuration_error', options);
  }
}

export class MailNotFoundError extends MailError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'mail_not_found', options);
  }
}

class MailProviderError extends MailError {
  constructor(
    readonly provider: MailProviderId,
    message: string,
    code = 'mail_provider_error',
    options?: ErrorOptions,
  ) {
    super(message, code, options);
  }
}

class GmailProviderError extends MailProviderError {
  constructor(message: string, code = 'gmail_provider_error', options?: ErrorOptions) {
    super('gmail', message, code, options);
  }
}

export class GmailApiError extends GmailProviderError {
  constructor(
    readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, 'gmail_api_error', options);
  }
}

export class GmailBatchError extends GmailProviderError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'gmail_batch_error', options);
  }
}

export class GmailAttachmentError extends GmailProviderError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'gmail_attachment_error', options);
  }
}
