class SchedulerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulerError';
  }
}

export class SchedulerNotStartedError extends SchedulerError {
  constructor() {
    super('Scheduler is not started');
    this.name = 'SchedulerNotStartedError';
  }
}

export class SchedulerJobUpsertError extends SchedulerError {
  readonly jobKey: string;
  constructor(jobKey: string) {
    super(`failed to update scheduled job ${jobKey}`);
    this.name = 'SchedulerJobUpsertError';
    this.jobKey = jobKey;
  }
}
