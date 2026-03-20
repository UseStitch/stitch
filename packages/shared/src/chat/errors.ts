export const STREAM_ERROR_CATEGORIES = [
  'auth',
  'context_overflow',
  'rate_limited',
  'quota',
  'invalid_prompt',
  'invalid_input',
  'invalid_response',
  'model_not_found',
  'provider_not_found',
  'tool_not_found',
  'unsupported',
  'retry_exhausted',
  'no_output',
  'api_error',
  'download_error',
  'unknown',
] as const;

export type StreamErrorCategory = (typeof STREAM_ERROR_CATEGORIES)[number];

export type StreamErrorDetails = {
  category: StreamErrorCategory;
  isRetryable: boolean;
  aiErrorName?: string;
  statusCode?: number;
};

export type UserFacingStreamError = {
  title: string;
  message: string;
  suggestion?: string;
};

export function toUserFacingStreamError(input: {
  error: string;
  details?: StreamErrorDetails;
}): UserFacingStreamError {
  const details = input.details;
  if (!details) {
    return {
      title: 'Request failed',
      message: input.error,
    };
  }

  switch (details.category) {
    case 'auth':
      return {
        title: 'Authentication failed',
        message: 'The model provider rejected your credentials.',
        suggestion: 'Check your provider API key in Settings and retry.',
      };
    case 'quota':
      return {
        title: 'Quota exceeded',
        message: 'Your provider account does not have enough quota or credits.',
        suggestion: 'Add credits or change provider/model, then retry.',
      };
    case 'rate_limited':
      return {
        title: 'Rate limited',
        message: 'The provider is throttling requests right now.',
        suggestion: 'Wait a few seconds and try again.',
      };
    case 'context_overflow':
      return {
        title: 'Context window exceeded',
        message: 'The conversation is too large for this model.',
        suggestion: 'Compact the session or use a model with a larger context window.',
      };
    case 'model_not_found':
      return {
        title: 'Model not found',
        message: 'The selected model is unavailable for this provider.',
        suggestion: 'Choose another model and retry.',
      };
    case 'provider_not_found':
      return {
        title: 'Provider unavailable',
        message: 'The selected provider is not configured or unavailable.',
        suggestion: 'Check provider settings and retry.',
      };
    case 'tool_not_found':
      return {
        title: 'Tool unavailable',
        message: 'The model requested a tool that is not available.',
        suggestion: 'Retry the request. If it repeats, adjust tool configuration.',
      };
    case 'unsupported':
      return {
        title: 'Unsupported feature',
        message: 'The selected model/provider does not support this capability.',
        suggestion: 'Switch model/provider and retry.',
      };
    case 'invalid_prompt':
    case 'invalid_input':
      return {
        title: 'Invalid request',
        message: 'The request was rejected by the provider.',
        suggestion: 'Edit the prompt or settings and retry.',
      };
    case 'invalid_response':
      return {
        title: 'Invalid provider response',
        message: 'The provider returned malformed or unexpected data.',
        suggestion: 'Retry the request. If it persists, try another model/provider.',
      };
    case 'retry_exhausted':
      return {
        title: 'Retries exhausted',
        message: 'The request failed after multiple retry attempts.',
        suggestion: 'Retry now or switch provider/model.',
      };
    case 'no_output':
      return {
        title: 'No output generated',
        message: 'The model did not produce output for this request.',
        suggestion: 'Retry or rephrase your prompt.',
      };
    case 'api_error':
      return {
        title: 'Provider error',
        message: 'The provider request failed unexpectedly.',
        suggestion: details.isRetryable ? 'Retry in a moment.' : undefined,
      };
    case 'download_error':
      return {
        title: 'Attachment error',
        message: 'A file attachment could not be processed.',
        suggestion: 'Check the file is accessible and try again.',
      };
    case 'unknown':
      return {
        title: 'Unexpected error',
        message: input.error,
      };
    default:
      return {
        title: 'Request failed',
        message: input.error,
      };
  }
}
