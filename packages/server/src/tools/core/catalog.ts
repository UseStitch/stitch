import { isDbInitialized } from '@/db/client.js';
import { getMemoryConfig } from '@/memory/config.js';
import { definition as bash } from '@/tools/core/bash.js';
import { definition as createSkill } from '@/tools/core/create-skill.js';
import { definition as edit } from '@/tools/core/edit.js';
import { definition as glob } from '@/tools/core/glob.js';
import { definition as grep } from '@/tools/core/grep.js';
import {
  createMemoryDefinition,
  createMemoryGetDefinition,
  createMemorySearchDefinition,
} from '@/tools/core/memory.js';
import { createDefinition as createQuestionDefinition } from '@/tools/core/question.js';
import { definition as read } from '@/tools/core/read.js';
import { definition as renderUi } from '@/tools/core/render-ui.js';
import { definition as skill } from '@/tools/core/skill.js';
import { createDefinition as createTodoDefinition } from '@/tools/core/todo.js';
import { definition as webfetch } from '@/tools/core/webfetch.js';
import { definition as write } from '@/tools/core/write.js';
import type { ToolDefinition } from '@/tools/runtime/pipeline.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

export type CatalogEntry = {
  name: string;
  displayName: string;
  create: (context: ToolContext) => ToolDefinition;
  /** If provided, called at assembly time to decide whether to include this tool. */
  enabled?: () => Promise<boolean> | boolean;
};

export const CORE_TOOL_CATALOG: CatalogEntry[] = [
  { name: 'webfetch', displayName: 'Web Fetch', create: () => webfetch },
  { name: 'read', displayName: 'Read File', create: () => read },
  { name: 'bash', displayName: 'Command Execution', create: () => bash },
  { name: 'glob', displayName: 'File Search', create: () => glob },
  { name: 'grep', displayName: 'Text Search', create: () => grep },
  { name: 'edit', displayName: 'Edit File', create: () => edit },
  { name: 'write', displayName: 'Write File', create: () => write },
  { name: 'render_ui', displayName: 'Render UI', create: () => renderUi },
  { name: 'skill', displayName: 'Load Skill', create: () => skill },
  { name: 'create_skill', displayName: 'Create Skill', create: () => createSkill },
  { name: 'question', displayName: 'Question', create: createQuestionDefinition },
  { name: 'todo', displayName: 'Todo', create: createTodoDefinition },
  {
    name: 'memory',
    displayName: 'Memory',
    create: createMemoryDefinition,
    enabled: async () => isDbInitialized() && (await getMemoryConfig()).enabled,
  },
  {
    name: 'memory_search',
    displayName: 'Memory Search',
    create: createMemorySearchDefinition,
    enabled: async () => isDbInitialized() && (await getMemoryConfig()).enabled,
  },
  {
    name: 'memory_get',
    displayName: 'Memory Get',
    create: createMemoryGetDefinition,
    enabled: async () => isDbInitialized() && (await getMemoryConfig()).enabled,
  },
];
