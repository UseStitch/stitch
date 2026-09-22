export function getErrorMessage<T>(error: T, fallback: string): string {
  return Error.isError(error) ? error.message : fallback;
}
