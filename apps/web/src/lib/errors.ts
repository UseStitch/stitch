export function getErrorMessage(error: unknown, fallback: string): string {
  return Error.isError(error) ? error.message : fallback;
}
