export class MemoryFileLockAdapter {
  private readonly queues = new Map<string, Promise<void>>();

  async withFileLock<T>(name: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(name) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.queues.set(name, queued);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.queues.get(name) === queued) this.queues.delete(name);
    }
  }
}
