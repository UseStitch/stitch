export type ServiceError = {
  error: string;
  status: 400 | 404;
  details?: unknown;
};

export type ServiceSuccess<T> = {
  data: T;
};

export type ServiceResult<T> = ServiceSuccess<T> | ServiceError;

export function ok<T>(data: T): ServiceSuccess<T> {
  return { data };
}

export function err(error: string, status: 400 | 404, details?: unknown): ServiceError {
  return { error, status, details };
}

export function isServiceError<T>(result: ServiceResult<T>): result is ServiceError {
  return 'error' in result;
}
