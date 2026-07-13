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
