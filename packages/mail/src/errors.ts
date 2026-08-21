class MailError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class MailConfigurationError extends MailError {}

export class MailNotFoundError extends MailError {}

export class GmailApiError extends MailError {
  constructor(
    readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class GmailBatchError extends MailError {}

export class GmailAttachmentError extends MailError {}
