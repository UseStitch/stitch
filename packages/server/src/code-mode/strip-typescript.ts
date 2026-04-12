type StripResult =
  | { code: string; error: null }
  | { code: null; error: string };

export function stripTypeScript(source: string): StripResult {
  try {
    const transpiler = new Bun.Transpiler({ loader: 'ts' });
    const code = transpiler.transformSync(source);
    return { code, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { code: null, error: `TypeScript syntax error: ${message}` };
  }
}
