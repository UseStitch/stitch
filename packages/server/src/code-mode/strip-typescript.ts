type StripResult =
  | { code: string; error: null }
  | { code: null; error: string };

const WRAPPER_PREFIX = 'async function __c__() {\n';
const WRAPPER_SUFFIX = '\n}';

export function stripTypeScript(source: string): StripResult {
  try {
    const transpiler = new Bun.Transpiler({ loader: 'ts' });
    const wrapped = `${WRAPPER_PREFIX}${source}${WRAPPER_SUFFIX}`;
    const transpiled = transpiler.transformSync(wrapped);
    // Strip the wrapper function to recover the plain JS body
    const start = transpiled.indexOf(WRAPPER_PREFIX);
    const end = transpiled.lastIndexOf(WRAPPER_SUFFIX);
    const code = start !== -1 && end > start
      ? transpiled.slice(start + WRAPPER_PREFIX.length, end)
      : transpiled;
    return { code, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { code: null, error: `TypeScript syntax error: ${message}` };
  }
}
