/**
 * Recursively sorts object keys so that semantically identical values always
 * produce the same JSON string regardless of original key order.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    // SAFETY: map preserves the array shape and recursion preserves each element's shape.
    return value.map((entry) => sortKeys(entry)) as T;
  }

  const sorted: Record<string, unknown> = {};
  // SAFETY: guarded above by the null/undefined/typeof checks plus the array branch, so value is a plain object here.
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record).toSorted()) {
    sorted[key] = sortKeys(record[key]);
  }
  // SAFETY: sorted has the same keys with recursively shape-preserved values.
  return sorted as T;
}
