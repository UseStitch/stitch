/**
 * Detect whether a JS expression uses top-level `return` and needs wrapping
 * in an IIFE so `Runtime.evaluate` can execute it.
 */
export function needsIIFEWrap(code: string): boolean {
  // Already an IIFE or arrow — no wrap needed
  const t = code.trimStart();
  if (t.startsWith('(') || t.startsWith('!') || t.startsWith('void')) return false;

  // Simple heuristic: contains `return` at a statement boundary
  // (not inside a string or nested function) — wrap it.
  return /(?:^|[;\n{])\s*return\s/m.test(code);
}
