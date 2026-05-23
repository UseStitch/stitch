import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { PrefixedString } from '@stitch/shared/id';

import type { ProviderCredentials } from '@/llm/provider/provider.js';

const mocks = vi.hoisted(() => {
  const createToolsMock = vi.fn(() => ({
    read: { description: 'Read files', execute: vi.fn() },
    bash: { description: 'Run commands', execute: vi.fn() },
  }));

  const createToolsetToolsMock = vi.fn(() => ({
    list_toolsets: { description: 'List toolsets', execute: vi.fn() },
    activate_toolset: { description: 'Activate toolset', execute: vi.fn() },
    deactivate_toolset: { description: 'Deactivate toolset', execute: vi.fn() },
  }));

  const createTaskToolMock = vi.fn(() => ({
    description: 'Create task',
    execute: vi.fn(),
  }));

  let codeModeGetTools: (() => Record<string, unknown>) | null = null;
  const createCodeModeToolMock = vi.fn((opts: { getTools: () => Record<string, unknown> }) => {
    codeModeGetTools = opts.getTools;
    return {
      tool: { description: 'Execute TypeScript', execute: vi.fn() },
      getSystemPrompt: () => 'code mode prompt',
    };
  });

  const getSessionActiveToolsetIdsMock = vi.fn((): string[] => []);
  const buildSkillsSystemPromptMock = vi.fn(async () => 'skills prompt');
  const getToolsetMock = vi.fn((id: string) => ({
    id,
    name: 'Browser',
    description: 'Browse the web',
    tools: () => [{ name: 'browser_open', description: 'Open page' }],
  }));

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
  const getCatalogWithStateMock = vi.fn(async () => [
    {
      id: 'browser',
      name: 'Browser',
      description: 'Browse the web',
      active: false,
      persisted: false,
      hasInstructions: false,
      promptCount: 0,
    },
  ]);
  const constructorArgs: unknown[][] = [];

  class ToolsetManagerMock {
    constructor(...args: unknown[]) {
      constructorArgs.push(args);
    }

    activate = activateMock;
    getActiveTools = getActiveToolsMock;
    getCatalogWithState = getCatalogWithStateMock;
  }

  return {
    createToolsMock,
    createToolsetToolsMock,
    createTaskToolMock,
    createCodeModeToolMock,
    getSessionActiveToolsetIdsMock,
    buildSkillsSystemPromptMock,
    getToolsetMock,
    activateMock,
    getActiveToolsMock,
    getCatalogWithStateMock,
    constructorArgs,
    getCodeModeTools: () => codeModeGetTools?.() ?? {},
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

vi.mock('@/skills/service.js', () => ({
  buildSkillsSystemPrompt: mocks.buildSkillsSystemPromptMock,
}));

vi.mock('@/tools/toolsets/manager.js', () => ({
  ToolsetManager: mocks.ToolsetManagerMock,
}));

vi.mock('@/tools/toolsets/registry.js', () => ({
  getToolset: mocks.getToolsetMock,
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
    mocks.constructorArgs.length = 0;
    mocks.getSessionActiveToolsetIdsMock.mockReturnValue([]);
    mocks.getActiveToolsMock.mockReturnValue({});
    mocks.activateMock.mockResolvedValue({
      status: 'activated',
      toolNames: [],
      collisions: [],
    });
  });

  test('assembles static tools and prompt additions', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    const result = await ToolAssembler.create(baseOptions()).assemble();

    expect(result.staticTools).toHaveProperty('read');
    expect(result.staticTools).toHaveProperty('bash');
    expect(result.staticTools).toHaveProperty('list_toolsets');
    expect(result.staticTools).toHaveProperty('activate_toolset');
    expect(result.staticTools).toHaveProperty('deactivate_toolset');
    expect(result.staticTools).toHaveProperty('task');
    expect(result.staticTools).toHaveProperty('execute_typescript');
    expect(result.promptAdditions).toEqual(
      expect.arrayContaining(['code mode prompt', expect.stringContaining('## Available Toolsets'), 'skills prompt']),
    );
  });

  test('excludes task tool when allowTaskTool is false', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    const result = await ToolAssembler.create({
      ...baseOptions(),
      allowTaskTool: false,
    }).assemble();

    expect(result.staticTools).not.toHaveProperty('task');
    expect(result.staticTools).toHaveProperty('read');
    expect(result.staticTools).toHaveProperty('execute_typescript');
  });

  test('passes restored toolset ids into the manager and activates them', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    await ToolAssembler.create({
      ...baseOptions(),
      activeToolsetIds: ['browser', 'mcp:github'],
    }).assemble();

    expect(mocks.constructorArgs[0]?.[1]).toEqual(['browser', 'mcp:github']);
    expect(mocks.activateMock).toHaveBeenCalledWith('browser');
    expect(mocks.activateMock).toHaveBeenCalledWith('mcp:github');
  });

  test('falls back to session-persisted toolset ids when activeToolsetIds is not provided', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    mocks.getSessionActiveToolsetIdsMock.mockReturnValue(['browser']);

    await ToolAssembler.create(baseOptions()).assemble();

    expect(mocks.getSessionActiveToolsetIdsMock).toHaveBeenCalledWith('ses_test');
    expect(mocks.constructorArgs[0]?.[1]).toEqual(['browser']);
    expect(mocks.activateMock).toHaveBeenCalledWith('browser');
  });

  test('code mode sees dynamic tools at call time', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    await ToolAssembler.create(baseOptions()).assemble();
    mocks.getActiveToolsMock.mockReturnValue({ browser_open: { description: 'Open page' } });

    expect(mocks.getCodeModeTools()).toHaveProperty('browser_open');
  });

  test('continues when restored toolset activation fails', async () => {
    const { ToolAssembler } = await import('@/llm/stream/tool-assembler.js');

    mocks.activateMock.mockResolvedValue({ status: 'not_found' });

    const result = await ToolAssembler.create({
      ...baseOptions(),
      activeToolsetIds: ['missing-toolset'],
    }).assemble();

    expect(result.staticTools).toHaveProperty('read');
    expect(mocks.activateMock).toHaveBeenCalledWith('missing-toolset');
  });
});
