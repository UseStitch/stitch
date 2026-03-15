export type QuestionOption = {
  label: string;
  description: string;
};

export type QuestionInfo = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};

export type QuestionRequest = {
  id: string;
  sessionId: string;
  questions: QuestionInfo[];
  toolCallId?: string;
  messageId?: string;
  status: 'pending' | 'answered' | 'rejected';
  answers?: string[][];
  createdAt: Date;
  answeredAt?: Date;
};

export type QuestionReply = {
  answers: string[][];
};

export type QuestionReject = Record<string, never>;
