class QuestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestionError';
  }
}

export class QuestionNotFoundAfterCreateError extends QuestionError {
  readonly questionId: string;
  constructor(id: string) {
    super(`Question not found after create: ${id}`);
    this.name = 'QuestionNotFoundAfterCreateError';
    this.questionId = id;
  }
}
