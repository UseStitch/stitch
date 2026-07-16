/**
 * Validate and normalize a base URL for local providers.
 * Returns the normalized URL (trailing slash stripped) or null if invalid.
 */
export function validateBaseURL(value: string): { valid: true; url: string } | { valid: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'URL must use http or https protocol' };
  }

  // Normalize: strip trailing slash
  const normalized = parsed.origin + parsed.pathname.replace(/\/+$/, '');
  return { valid: true, url: normalized };
}
