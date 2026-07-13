class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class DatabaseNotInitializedError extends DatabaseError {
  constructor() {
    super('Database not initialized - call initDb() first');
    this.name = 'DatabaseNotInitializedError';
  }
}

export class LanceMigrationDuplicateVersionError extends DatabaseError {
  readonly version: number;
  constructor(version: number) {
    super(`Duplicate Lance migration version: ${version}`);
    this.name = 'LanceMigrationDuplicateVersionError';
    this.version = version;
  }
}

export class LanceMigrationDuplicateIdError extends DatabaseError {
  readonly migrationId: string;
  constructor(id: string) {
    super(`Duplicate Lance migration id: ${id}`);
    this.name = 'LanceMigrationDuplicateIdError';
    this.migrationId = id;
  }
}

export class LanceMigrationGapError extends DatabaseError {
  readonly previousVersion: number;
  readonly currentVersion: number;
  constructor(previousVersion: number, currentVersion: number) {
    super(`Lance migration version gap detected between v${previousVersion} and v${currentVersion}`);
    this.name = 'LanceMigrationGapError';
    this.previousVersion = previousVersion;
    this.currentVersion = currentVersion;
  }
}

export class LanceMigrationChainBrokenError extends DatabaseError {
  readonly version: number;
  readonly expectedPrevId: string;
  readonly actualPrevId: string | null;
  constructor(version: number, expectedPrevId: string, actualPrevId: string | null) {
    super(`Lance migration chain broken at v${version}: expected prevId ${expectedPrevId}, found ${actualPrevId}`);
    this.name = 'LanceMigrationChainBrokenError';
    this.version = version;
    this.expectedPrevId = expectedPrevId;
    this.actualPrevId = actualPrevId;
  }
}

export class LanceMigrationRootError extends DatabaseError {
  readonly version: number;
  constructor(version: number) {
    super(`First Lance migration must have prevId=null (v${version})`);
    this.name = 'LanceMigrationRootError';
    this.version = version;
  }
}

export class LanceMigrationChecksumMismatchError extends DatabaseError {
  readonly version: number;
  readonly migrationName: string;
  readonly field: 'id' | 'prevId' | 'checksum';
  readonly expected: string | null;
  readonly actual: string | null;
  constructor(
    version: number,
    name: string,
    field: 'id' | 'prevId' | 'checksum',
    expected: string | null,
    actual: string | null,
  ) {
    const detail = field === 'checksum' ? `. This usually means an already-applied migration file was edited.` : '';
    super(
      `Lance migration ${field} mismatch for v${version} (${name}). Expected ${expected}, found ${actual}${detail}`,
    );
    this.name = 'LanceMigrationChecksumMismatchError';
    this.version = version;
    this.migrationName = name;
    this.field = field;
    this.expected = expected;
    this.actual = actual;
  }
}

export class LanceMigrationUnknownVersionError extends DatabaseError {
  readonly version: number;
  constructor(version: number) {
    super(
      `Lance migration history contains unknown applied version: v${version}. Migration files may be missing or reordered.`,
    );
    this.name = 'LanceMigrationUnknownVersionError';
    this.version = version;
  }
}
