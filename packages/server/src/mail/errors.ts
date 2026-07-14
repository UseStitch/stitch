class MailError extends Error {
  readonly accountEmail?: string;
  constructor(message: string, accountEmail?: string) {
    super(message);
    this.name = 'MailError';
    this.accountEmail = accountEmail;
  }
}

export class MailConnectorInstanceNotFoundError extends MailError {
  constructor() {
    super('Connector instance not found');
    this.name = 'MailConnectorInstanceNotFoundError';
  }
}

export class MailConnectorNotGoogleError extends MailError {
  readonly connectorId: string;
  constructor(connectorId: string) {
    super('Only Google connector instances can be enrolled for mail');
    this.name = 'MailConnectorNotGoogleError';
    this.connectorId = connectorId;
  }
}

export class MailConnectorNotConnectedError extends MailError {
  readonly status: string;
  constructor(status: string) {
    super('Google connector instance must be connected before mail enrollment');
    this.name = 'MailConnectorNotConnectedError';
    this.status = status;
  }
}

export class MailMissingAccountEmailError extends MailError {
  constructor() {
    super('Google connector instance is missing an account email');
    this.name = 'MailMissingAccountEmailError';
  }
}

export class MailMissingScopesError extends MailError {
  readonly missingScopes: string[];
  constructor(missingScopes: string[] = ['gmail.readonly', 'gmail.modify']) {
    super(`Google connector instance is missing required Gmail scopes: ${missingScopes.join(', ')}`);
    this.name = 'MailMissingScopesError';
    this.missingScopes = missingScopes;
  }
}
