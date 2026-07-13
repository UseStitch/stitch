class ConnectorValidationError extends Error {
  readonly connectorId: string;

  constructor(connectorId: string, message: string) {
    super(message);
    this.name = 'ConnectorValidationError';
    this.connectorId = connectorId;
  }
}

export class ConnectorEmptyVersionHistoryError extends ConnectorValidationError {
  constructor(connectorId: string) {
    super(connectorId, `Connector ${connectorId} must define at least one version`);
    this.name = 'ConnectorEmptyVersionHistoryError';
  }
}

export class ConnectorDuplicateVersionError extends ConnectorValidationError {
  readonly duplicateVersion: number;

  constructor(connectorId: string, version: number) {
    super(connectorId, `Connector ${connectorId} has duplicate version ${version}`);
    this.name = 'ConnectorDuplicateVersionError';
    this.duplicateVersion = version;
  }
}

export class ConnectorVersionMismatchError extends ConnectorValidationError {
  readonly currentVersion: number;
  readonly highestVersion: number;

  constructor(connectorId: string, currentVersion: number, highestVersion: number) {
    super(
      connectorId,
      `Connector ${connectorId} currentVersion (${currentVersion}) must match highest versionHistory entry (${highestVersion})`,
    );
    this.name = 'ConnectorVersionMismatchError';
    this.currentVersion = currentVersion;
    this.highestVersion = highestVersion;
  }
}

export class GoogleAccountNotFoundError extends ConnectorValidationError {
  readonly requestedAccount?: string;
  constructor(connectorId: string, requestedAccount?: string) {
    const msg = requestedAccount
      ? `Unknown Google account "${requestedAccount}"`
      : 'No connected Google accounts found. Connect and authorize Google first.';
    super(connectorId, msg);
    this.name = 'GoogleAccountNotFoundError';
    this.requestedAccount = requestedAccount;
  }
}

export class GoogleAccountInsufficientScopesError extends ConnectorValidationError {
  readonly accountEmail: string;
  readonly toolsetName: string;
  constructor(connectorId: string, accountEmail: string, toolsetName: string) {
    super(
      connectorId,
      `Google account ${accountEmail} does not have the permissions required for ${toolsetName}. Re-authorize this account with the required scopes.`,
    );
    this.name = 'GoogleAccountInsufficientScopesError';
    this.accountEmail = accountEmail;
    this.toolsetName = toolsetName;
  }
}

export class GoogleAccountNotAuthorizedError extends ConnectorValidationError {
  readonly accountEmail: string;
  constructor(connectorId: string, accountEmail: string) {
    super(connectorId, `Google account ${accountEmail} is not authorized.`);
    this.name = 'GoogleAccountNotAuthorizedError';
    this.accountEmail = accountEmail;
  }
}

export class GoogleAccountNoAccessTokenError extends ConnectorValidationError {
  readonly accountEmail: string;
  constructor(connectorId: string, accountEmail: string) {
    super(connectorId, `Google account ${accountEmail} has no usable access token. Re-authorize this account.`);
    this.name = 'GoogleAccountNoAccessTokenError';
    this.accountEmail = accountEmail;
  }
}
