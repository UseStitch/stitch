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
