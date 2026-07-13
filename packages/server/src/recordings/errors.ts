class RecordingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordingError';
  }
}

export class RecordingAnalysisEmptyResponseError extends RecordingError {
  constructor() {
    super('Analysis did not return markdown notes');
    this.name = 'RecordingAnalysisEmptyResponseError';
  }
}
