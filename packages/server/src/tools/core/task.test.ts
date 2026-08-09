import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';

import { TASK_DESCRIPTION, createTaskTool } from '@/tools/core/task.js';
import type { ToolsetManager } from '@/tools/toolsets/manager.js';

describe('task tool background contract', () => {
  test('documents automatic notification and prohibits polling', () => {
    expect(TASK_DESCRIPTION).toContain('Background mode returns immediately');
    expect(TASK_DESCRIPTION).toContain('result arrives automatically');
    expect(TASK_DESCRIPTION).toContain('Do not poll');
    expect(TASK_DESCRIPTION).toContain('non-overlapping work');
  });

  test('accepts background as optional and preserves the foreground default', () => {
    const tool = createTaskTool(
      {
        sessionId: 'ses_parent' as PrefixedString<'ses'>,
        messageId: 'msg_parent' as PrefixedString<'msg'>,
        streamRunId: 'run',
      },
      {
        parentSessionId: 'ses_parent' as PrefixedString<'ses'>,
        parentAbortSignal: new AbortController().signal,
        credentials: { providerId: 'openai', auth: { method: 'api-key', apiKey: 'test' } },
        modelId: 'model',
        providerId: 'openai',
        toolsetManager: { getActiveIds: () => new Set<string>() } as ToolsetManager,
      },
    );

    const schema = tool.inputSchema as z.ZodType;
    expect(schema.safeParse({ title: 'Task', task: 'Do work' }).success).toBeTrue();
    expect(schema.safeParse({ title: 'Task', task: 'Do work', background: true }).success).toBeTrue();
  });
});
