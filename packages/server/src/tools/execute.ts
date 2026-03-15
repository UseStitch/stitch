import { TOOL_EXECUTORS } from './index.js';

export const MAX_STEPS = 25;

export const MAX_STEPS_WARNING = (max: number) =>
  `CRITICAL: You are on step ${max} (final step). Tools will be disabled after this. Complete all remaining work and provide your final answer.`;

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