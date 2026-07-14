export function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function formatDate(value: number | string): string {
  return new Date(value).toLocaleDateString();
}
