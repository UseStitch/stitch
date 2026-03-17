import os from 'node:os';

import { resolvePreferredShell } from '@/lib/shell.js';

export function buildPromptEnvironment(modelId: string): string {
  const currentDate = new Date().toISOString();
  const preferredShell = resolvePreferredShell().shell;

  return [
    '<env>',
    `Current date: ${currentDate}`,
    `Model id: ${modelId}`,
    `Operating system: ${process.platform} ${os.release()}`,
    `Home directory: ${os.homedir()}`,
    `Preferred shell: ${preferredShell}`,
    '</env>',
  ].join('\n');
}
