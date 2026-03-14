import { TOOL_EXECUTORS } from './index.js';

type ExecuteResult = { ok: true; output: unknown } | { ok: false; error: string };

export async function executeTool(toolName: string, input: unknown): Promise<ExecuteResult> {
  const executor = TOOL_EXECUTORS[toolName];
  if (!executor) return { ok: false, error: `Unknown tool: ${toolName}` };

  const parsed = executor.inputSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    return { ok: false, error: `Invalid arguments for "${toolName}":\n${issues}` };
  }

  try {
    const output = await executor.execute(parsed.data);
    return { ok: true, output };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}