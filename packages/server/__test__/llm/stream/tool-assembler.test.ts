import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { PrefixedString } from '@stitch/shared/id';

import type { ProviderCredentials } from '@/llm/provider/provider.js';

const mocks = vi.hoisted(() => {
  const createToolsMock = vi.fn(() => ({
    read: { execute: vi.fn() },
    bash: { execute: vi.fn() },
  }));

  const createToolsetToolsMock = vi.fn(() => ({
    list_toolsets: { execute: vi.fn() },
    activate_toolset: { execute: vi.fn() },
    deactivate_toolset: { execute: vi.fn() },
  }));

  const createTaskToolMock = vi.fn(() => ({
    execute: vi.fn(),
  }));

  const createCodeModeToolMock = vi.fn(() => ({
    tool: { execute: vi.fn() },
    getSystemPrompt: () => 'code mode prompt',
  }));

  const getSessionActiveToolsetIdsMock = vi.fn((): string[] => []);

  const activateMock = vi.fn(
    async (): Promise<
      | { status: 'activated'; toolNames: string[]; collisions: string[] }
      | { status: 'not_found' }
      | { status: 'disabled' }
    > => ({
      status: 'activated',
      toolNames: [],
      collisions: [],
    }),
  );

  const getActiveToolsMock = vi.fn(() => ({}));
  const getActiveIdsMock = vi.fn(() => new Set<string>());

  class ToolsetManagerMock {
    activate = activateMock;
    getActiveTools = getActiveToolsMock;
    getActiveIds = getActiveIdsMock;
  }

  return {
    createToolsMock,
    createToolsetToolsMock,
    createTaskToolMock,
    createCodeModeToolMock,
    getSessionActiveToolsetIdsMock,
    activateMock,
    getActiveToolsMock,
    getActiveIdsMock,
    ToolsetManagerMock,
  };
});

vi.mock('@/tools/runtime/registry.js', () => ({
  createTools: mocks.createToolsMock,
}));

vi.mock('@/tools/core/toolset-management.js', () => ({
  createToolsetTools: mocks.createToolsetToolsMock,
}));

vi.mock('@/tools/core/task.js', () => ({
  createTaskTool: mocks.createTaskToolMock,
}));

vi.mock('@/code-mode/tool.js', () => ({
  createCodeModeTool: mocks.createCodeModeToolMock,
}));

vi.mock('@/llm/stream/session-toolsets.js', () => ({
  getSessionActiveToolsetIds: mocks.getSessionActiveToolsetIdsMock,
}));

vi.mock('@/tools/toolsets/manager.js', () => ({
  ToolsetManager: mocks.ToolsetManagerMock,
}));

vi.mock('@/tools/runtime/wrappers.js', () => ({
  withToolResultHandling: <T>(t: T) => t,
  withToolResultHandlingRecord: <T>(t: T) => t,
}));

const CREDENTIALS: ProviderCredentials = {
  providerId: 'openai',
  auth: { method: 'api-key', apiKey: 'test-key' },
};

function baseOptions() {
  return {
    sessionId: 'ses_test' as PrefixedString<'ses'>,
    messageId: 'msg_test' as PrefixedString<'msg'>,
    streamRunId: 'run_test',
    credentials: CREDENTIALS,
    modelId: 'openai/gpt-5.3-codex',
    abortSignal: new AbortController().signal,
  };
}

describe('ToolAssembler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionActiveToolsetIdsMock.mockReturnValue([]);
    mocks.activateMock.mockResolvedValue({
      status: 'activated',
      toolNames: [],
      collisions: [],
    });
  });

  test('assemble returns coreTools including core stitch tools, meta tools, task tool, and code mode', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    const result = await ToolAssembler.create(baseOptions()).assemble();

    expect(result.coreTools).toHaveProperty('read');
    expect(result.coreTools).toHaveProperty('bash');
    expect(result.coreTools).toHaveProperty('list_toolsets');
    expect(result.coreTools).toHaveProperty('activate_toolset');
    expect(result.coreTools).toHaveProperty('deactivate_toolset');
    expect(result.coreTools).toHaveProperty('task');
    expect(result.coreTools).toHaveProperty('execute_typescript');
  });

  test('excludes task tool when allowTaskTool is false', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    const result = await ToolAssembler.create({
      ...baseOptions(),
      allowTaskTool: false,
    }).assemble();

    expect(result.coreTools).not.toHaveProperty('task');
    expect(result.coreTools).toHaveProperty('read');
    expect(result.coreTools).toHaveProperty('execute_typescript');
  });

  test('restores toolsets from activeToolsetIds when provided', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    await ToolAssembler.create({
      ...baseOptions(),
      activeToolsetIds: ['browser', 'mcp:my-server'],
    }).assemble();

    expect(mocks.activateMock).toHaveBeenCalledWith('browser');
    expect(mocks.activateMock).toHaveBeenCalledWith('mcp:my-server');
  });

  test('falls back to session-persisted toolset ids when activeToolsetIds is not provided', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    mocks.getSessionActiveToolsetIdsMock.mockReturnValue(['browser']);

    await ToolAssembler.create(baseOptions()).assemble();

    expect(mocks.getSessionActiveToolsetIdsMock).toHaveBeenCalledWith('ses_test');
    expect(mocks.activateMock).toHaveBeenCalledWith('browser');
  });

  test('skips toolset restoration when no toolset ids exist', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    mocks.getSessionActiveToolsetIdsMock.mockReturnValue([]);

    await ToolAssembler.create(baseOptions()).assemble();

    expect(mocks.activateMock).not.toHaveBeenCalled();
  });

  test('returns codeModeSystemPrompt from code mode tool', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    const result = await ToolAssembler.create(baseOptions()).assemble();

    expect(result.codeModeSystemPrompt).toBe('code mode prompt');
  });

  test('returns a toolsetManager instance', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    const result = await ToolAssembler.create(baseOptions()).assemble();

    expect(result.toolsetManager).toBeDefined();
    expect(typeof result.toolsetManager.getActiveTools).toBe('function');
  });

  test('handles toolset activation failures gracefully', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    mocks.activateMock.mockResolvedValue({ status: 'not_found' });

    const result = await ToolAssembler.create({
      ...baseOptions(),
      activeToolsetIds: ['missing-toolset'],
    }).assemble();

    expect(result.coreTools).toHaveProperty('read');
    expect(mocks.activateMock).toHaveBeenCalledWith('missing-toolset');
  });
});
