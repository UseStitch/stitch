export type ServiceError = { message: string; status: 400 | 401 | 403 | 404 | 409 | 422 | 500; details?: unknown };

export type ServiceSuccess<T> = { data: T; error: null };

export type ServiceFailure = { data: null; error: ServiceError };

export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

export function ok<T>(data: T): ServiceSuccess<T> {
  return { data, error: null };
}

export function err(
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
  details?: unknown,
): ServiceFailure {
  return { data: null, error: { message, status, details } };
}
