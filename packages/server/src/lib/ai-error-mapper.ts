import { APICallError } from 'ai';
import type { StreamErrorCategory, StreamErrorDetails } from '@openwork/shared';

const OVERFLOW_PATTERNS = [
  /prompt is too long/i,
  /input is too long for requested model/i,
  /exceeds the context window/i,
  /input token count.*exceeds the maximum/i,
  /maximum prompt length is \d+/i,
  /reduce the length of the messages/i,
  /maximum context length is \d+ tokens/i,
  /exceeds the limit of \d+/i,
  /exceeds the available context size/i,
  /context window exceeds limit/i,
  /exceeded model token limit/i,
  /context[_\s]length[_\s]exceeded/i,
  /request entity too large/i,
  /context length is only \d+ tokens/i,
  /input length.*exceeds.*context length/i,
];

const TOO_MANY_REQUESTS_PATTERN = /too many requests|rate limit|rate_limit/i;
const OVERLOADED_PATTERN = /overloaded|temporarily unavailable|service unavailable|server busy/i;
const QUOTA_PATTERN = /insufficient_quota|quota exceeded|credit balance is too low|billing/i;
const AUTH_PATTERN = /unauthorized|forbidden|invalid api key|authentication/i;

type MappedAIError = {
  category: StreamErrorCategory;
  aiErrorName?: string;
  message: string;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  metadata?: Record<string, string>;
  isRetryable: boolean;
  isContextOverflow: boolean;
};

export function toStreamErrorDetails(error: MappedAIError): StreamErrorDetails {
  return {
    category: error.category,
    isRetryable: error.isRetryable,
    aiErrorName: error.aiErrorName,
    statusCode: error.statusCode,
  };
}

type MinimalError = {
  name?: string;
  message?: string;
  statusCode?: number;
  responseBody?: string;
};

const NO_OUTPUT_ERROR_NAMES = new Set([
  'NoSpeechGeneratedError',
  'NoContentGeneratedError',
  'NoImageGeneratedError',
  'NoTranscriptGeneratedError',
  'NoVideoGeneratedError',
  'NoObjectGeneratedError',
  'NoOutputGeneratedError',
]);

const NAME_TO_CATEGORY: Record<string, StreamErrorCategory> = {
  DownloadError: 'api_error',
  EmptyResponseBodyError: 'invalid_response',
  InvalidArgumentError: 'invalid_input',
  InvalidDataContentError: 'invalid_input',
  InvalidMessageRoleError: 'invalid_input',
  InvalidPromptError: 'invalid_prompt',
  InvalidResponseDataError: 'invalid_response',
  InvalidToolApprovalError: 'invalid_input',
  InvalidToolInputError: 'invalid_input',
  JSONParseError: 'invalid_response',
  LoadAPIKeyError: 'auth',
  LoadSettingError: 'invalid_input',
  MessageConversionError: 'invalid_response',
  NoSuchModelError: 'model_not_found',
  NoSuchProviderError: 'provider_not_found',
  NoSuchToolError: 'tool_not_found',
  RetryError: 'retry_exhausted',
  TooManyEmbeddingValuesForCallError: 'invalid_input',
  ToolCallNotFoundForApprovalError: 'invalid_input',
  ToolCallRepairError: 'invalid_input',
  TypeValidationError: 'invalid_response',
  UIMessageStreamError: 'invalid_response',
  UnsupportedFunctionalityError: 'unsupported',
};

function normalizeHeaders(input: unknown): Record<string, string> | undefined {
  if (!input) return undefined;

  if (input instanceof Headers) {
    const headers: Record<string, string> = {};
    for (const [key, value] of input) {
      headers[key.toLowerCase()] = value;
    }
    return headers;
  }

  if (typeof input === 'object' && input !== null) {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      headers[key.toLowerCase()] = String(value);
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  return undefined;
}

function isOpenAiErrorRetryable(error: APICallError): boolean {
  const status = error.statusCode;
  if (!status) return error.isRetryable;
  return status === 404 || error.isRetryable;
}

function resolveAIErrorName(error: unknown): string | undefined {
  if (error instanceof Error && typeof error.name === 'string' && error.name.length > 0) {
    return error.name;
  }

  if (typeof error === 'object' && error !== null && typeof (error as MinimalError).name === 'string') {
    return (error as MinimalError).name;
  }

  return undefined;
}

function resolveMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && typeof (error as MinimalError).message === 'string') {
    const message = (error as { message: string }).message;
    return message;
  }
  return String(error);
}

function parseErrorBody(input: string | undefined): Record<string, unknown> | undefined {
  if (!input) return undefined;
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return undefined;
}

function getErrorObject(body: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const value = body?.error;
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function isContextOverflow(message: string, statusCode?: number): boolean {
  if (statusCode === 413) return true;
  return OVERFLOW_PATTERNS.some((pattern) => pattern.test(message));
}

function categoryFromName(name: string | undefined): StreamErrorCategory | undefined {
  if (!name) return undefined;
  if (NO_OUTPUT_ERROR_NAMES.has(name)) return 'no_output';
  return NAME_TO_CATEGORY[name];
}

function inferCategoryFromPayload(input: {
  message: string;
  statusCode?: number;
  body?: Record<string, unknown>;
  aiErrorName?: string;
}): StreamErrorCategory {
  const { message, statusCode, body } = input;
  const errorObject = getErrorObject(body);
  const code = typeof errorObject?.code === 'string' ? errorObject.code : undefined;
  const bodyMessage = typeof body?.message === 'string' ? body.message : undefined;
  const bodyErrorMessage = typeof errorObject?.message === 'string' ? errorObject.message : undefined;
  const combined = `${message} ${bodyMessage ?? ''} ${bodyErrorMessage ?? ''}`.trim();

  if (isContextOverflow(combined, statusCode) || code === 'context_length_exceeded') {
    return 'context_overflow';
  }

  if (typeof code === 'string' && code.toLowerCase() === 'insufficient_quota') {
    return 'quota';
  }

  if (typeof code === 'string' && code.toLowerCase() === 'invalid_prompt') {
    return 'invalid_prompt';
  }

  if ((statusCode === 401 || statusCode === 403) || AUTH_PATTERN.test(combined)) {
    return 'auth';
  }

  if (statusCode === 429 || TOO_MANY_REQUESTS_PATTERN.test(combined)) {
    return 'rate_limited';
  }

  if (statusCode === 404 && /model|deployment|not found/i.test(combined)) {
    return 'model_not_found';
  }

  if (QUOTA_PATTERN.test(combined)) {
    return 'quota';
  }

  if ((statusCode && statusCode >= 500) || OVERLOADED_PATTERN.test(combined)) {
    return 'api_error';
  }

  return 'api_error';
}

function isRetryableCategory(category: StreamErrorCategory, statusCode?: number): boolean {
  if (category === 'context_overflow') return false;
  if (category === 'auth') return false;
  if (category === 'quota') return false;
  if (category === 'invalid_prompt') return false;
  if (category === 'invalid_input') return false;
  if (category === 'invalid_response') return false;
  if (category === 'model_not_found') return false;
  if (category === 'provider_not_found') return false;
  if (category === 'tool_not_found') return false;
  if (category === 'unsupported') return false;
  if (category === 'retry_exhausted') return false;
  if (category === 'no_output') return false;
  if (category === 'rate_limited') return true;

  if (statusCode && statusCode >= 500) return true;
  return category === 'api_error';
}

export function mapAIError(error: unknown, providerId?: string): MappedAIError {
  if (error instanceof APICallError) {
    const responseHeaders = normalizeHeaders(error.responseHeaders);
    const body = parseErrorBody(error.responseBody);
    const bodyError = getErrorObject(body);
    const aiErrorName = resolveAIErrorName(error);

    let message = error.message;
    if (!message && typeof body?.message === 'string') message = body.message;
    if (!message && typeof bodyError?.message === 'string') {
      message = bodyError.message;
    }
    if (!message && error.statusCode) message = `HTTP ${error.statusCode}`;
    if (!message) message = 'Unknown error';

    const category = inferCategoryFromPayload({
      message,
      statusCode: error.statusCode,
      body,
      aiErrorName,
    });
    const baseRetryable = providerId?.startsWith('openai') ? isOpenAiErrorRetryable(error) : error.isRetryable;
    const isRetryable = baseRetryable && isRetryableCategory(category, error.statusCode);

    return {
      category,
      aiErrorName,
      message,
      statusCode: error.statusCode,
      responseHeaders,
      responseBody: error.responseBody,
      metadata: error.url ? { url: error.url } : undefined,
      isRetryable,
      isContextOverflow: category === 'context_overflow',
    };
  }

  const aiErrorName = resolveAIErrorName(error);
  const message = resolveMessage(error);
  const statusCode =
    typeof error === 'object' && error !== null && typeof (error as MinimalError).statusCode === 'number'
      ? (error as MinimalError).statusCode
      : undefined;
  const body =
    typeof error === 'object' && error !== null
      ? parseErrorBody((error as MinimalError).responseBody)
      : undefined;
  const inferredCategory = inferCategoryFromPayload({
    message,
    statusCode,
    body,
    aiErrorName,
  });
  const namedCategory = categoryFromName(aiErrorName);
  const category = inferredCategory === 'context_overflow' ? inferredCategory : namedCategory ?? inferredCategory;

  return {
    category,
    aiErrorName,
    message,
    statusCode,
    responseBody:
      typeof error === 'object' && error !== null ? (error as MinimalError).responseBody : undefined,
    isRetryable: isRetryableCategory(category, statusCode),
    isContextOverflow: category === 'context_overflow',
  };
}
