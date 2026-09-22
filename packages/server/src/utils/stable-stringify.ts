/**
 * Recursively sorts object keys so that semantically identical values always
 * produce the same JSON string regardless of original key order.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined || Object(value) !== value || Function.prototype.isPrototypeOf(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sortKeys(entry));
  }

  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
}
