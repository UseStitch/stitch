import { APICallError } from 'ai';
import { z } from 'zod';

import type { StreamErrorCategory, StreamErrorDetails } from '@stitch/shared/chat/errors';

import { StreamPartError } from '@/llm/stream/errors.js';

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
const QUOTA_PATTERN = /insufficient_quota|quota exceeded|credit balance is too low|billing/i;
const AUTH_PATTERN = /unauthorized|forbidden|invalid api key|authentication/i;
const UNSUPPORTED_PATTERN = /unsupported model|prompt caching/i;
export const OVERLOADED_PATTERN = /overloaded|temporarily unavailable|service unavailable|server busy/i;

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

type MinimalError = { name?: string; message?: string; statusCode?: number; responseBody?: string };

// Boundary decoders: each field falls back independently so one malformed field
// never discards the remaining error evidence.
const errorBodySchema = z.looseObject({
  message: z.string().optional().catch(undefined),
  error: z.unknown(),
});
const errorPayloadSchema = z.looseObject({
  code: z.string().optional().catch(undefined),
  message: z.string().optional().catch(undefined),
});

type ErrorBody = z.infer<typeof errorBodySchema>;
type ErrorPayload = z.infer<typeof errorPayloadSchema>;

function toMinimalError(error: unknown): MinimalError | undefined {
  const parsed = z
    .looseObject({
      name: z.string().optional().catch(undefined),
      message: z.string().optional().catch(undefined),
      statusCode: z.number().optional().catch(undefined),
      responseBody: z.string().optional().catch(undefined),
    })
    .safeParse(error);
  return parsed.success ? parsed.data : undefined;
}

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
  DownloadError: 'download_error',
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
  return input ? Object.fromEntries(new Headers(input as ConstructorParameters<typeof Headers>[0])) : undefined;
}

function isOpenAiErrorRetryable(error: APICallError): boolean {
  const status = error.statusCode;
  if (!status) return error.isRetryable;
  return status === 404 || error.isRetryable;
}

function resolveAIErrorName(error: unknown): string | undefined {
  if (Error.isError(error) && error.name.length > 0) {
    return error.name;
  }

  return toMinimalError(error)?.name;
}

function resolveMessage(error: unknown): string {
  if (Error.isError(error)) return error.message;
  return toMinimalError(error)?.message ?? String(error);
}

function parseErrorBody(input: string | undefined): ErrorBody | undefined {
  if (!input) return undefined;
  try {
    const parsed = errorBodySchema.safeParse(JSON.parse(input));
    return parsed.success ? parsed.data : undefined;
  } catch {}
  return undefined;
}

function getErrorObject(body: ErrorBody | undefined): ErrorPayload | undefined {
  const parsed = errorPayloadSchema.safeParse(body?.error);
  return parsed.success ? parsed.data : undefined;
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
  body?: ErrorBody;
  aiErrorName?: string;
}): StreamErrorCategory {
  const { message, statusCode, body } = input;
  const errorObject = getErrorObject(body);
  const code = errorObject?.code;
  const bodyMessage = body?.message;
  const bodyErrorMessage = errorObject?.message;
  const combined = `${message} ${bodyMessage ?? ''} ${bodyErrorMessage ?? ''}`.trim();

  if (isContextOverflow(combined, statusCode) || code === 'context_length_exceeded') {
    return 'context_overflow';
  }

  if (code?.toLowerCase() === 'insufficient_quota') {
    return 'quota';
  }

  if (code?.toLowerCase() === 'invalid_prompt') {
    return 'invalid_prompt';
  }

  if (UNSUPPORTED_PATTERN.test(combined)) {
    return 'unsupported';
  }

  if (statusCode === 401 || statusCode === 403 || AUTH_PATTERN.test(combined)) {
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

const NON_RETRYABLE = new Set<StreamErrorCategory>([
  'context_overflow',
  'auth',
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
  'download_error',
]);

function isRetryableCategory(category: StreamErrorCategory, statusCode?: number): boolean {
  if (NON_RETRYABLE.has(category)) return false;
  return category === 'rate_limited' || category === 'api_error' || (statusCode ?? 0) >= 500;
}

export function mapAIError(error: unknown, providerId?: string): MappedAIError {
  if (error instanceof StreamPartError && error.cause !== null && error.cause !== undefined) {
    return mapAIError(error.cause, providerId);
  }

  if (error instanceof APICallError) {
    const responseHeaders = normalizeHeaders(error.responseHeaders);
    const body = parseErrorBody(error.responseBody);
    const bodyError = getErrorObject(body);
    const aiErrorName = resolveAIErrorName(error);

    let message = error.message;
    if (!message && body?.message) message = body.message;
    if (!message && bodyError?.message) {
      message = bodyError.message;
    }
    if (!message && error.statusCode) message = `HTTP ${error.statusCode}`;
    if (!message) message = 'Unknown error';

    const category = inferCategoryFromPayload({ message, statusCode: error.statusCode, body, aiErrorName });
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
  const decoded = toMinimalError(error);
  const statusCode = decoded?.statusCode;
  const body = decoded ? parseErrorBody(decoded.responseBody) : undefined;
  const inferredCategory = inferCategoryFromPayload({ message, statusCode, body, aiErrorName });
  const namedCategory = categoryFromName(aiErrorName);
  const category = inferredCategory === 'context_overflow' ? inferredCategory : (namedCategory ?? inferredCategory);

  return {
    category,
    aiErrorName,
    message,
    statusCode,
    responseBody: decoded?.responseBody,
    isRetryable: isRetryableCategory(category, statusCode),
    isContextOverflow: category === 'context_overflow',
  };
}
