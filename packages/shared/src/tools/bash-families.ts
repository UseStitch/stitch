export type FamilyRule = {
  tokens: readonly string[];
  arity: number;
  description: string;
  /** Show as a quick-add preset in the permissions UI */
  showAsPreset: boolean;
};

export const FAMILY_RULES: FamilyRule[] = [
  // ── Dev tools ──────────────────────────────────────────────────────────────
  { tokens: ['git'], arity: 1, description: 'run git commands', showAsPreset: true },
  { tokens: ['bun'], arity: 1, description: 'run bun commands', showAsPreset: true },
  { tokens: ['npm'], arity: 1, description: 'run npm commands', showAsPreset: true },
  { tokens: ['npx'], arity: 1, description: 'run npx commands', showAsPreset: true },
  { tokens: ['node'], arity: 1, description: 'run node scripts', showAsPreset: true },
  { tokens: ['python'], arity: 1, description: 'run python scripts', showAsPreset: true },
  { tokens: ['python3'], arity: 1, description: 'run python3 scripts', showAsPreset: true },
  { tokens: ['pip'], arity: 1, description: 'manage python packages', showAsPreset: true },
  { tokens: ['pip3'], arity: 1, description: 'manage python3 packages', showAsPreset: true },
  { tokens: ['cargo'], arity: 1, description: 'run cargo commands', showAsPreset: true },
  { tokens: ['go'], arity: 1, description: 'run go commands', showAsPreset: true },
  { tokens: ['docker'], arity: 1, description: 'run docker commands', showAsPreset: true },
  { tokens: ['kubectl'], arity: 1, description: 'run kubectl commands', showAsPreset: true },
  { tokens: ['curl'], arity: 1, description: 'make HTTP requests', showAsPreset: true },
  { tokens: ['wget'], arity: 1, description: 'download files', showAsPreset: true },
  // ── Shell primitives ───────────────────────────────────────────────────────
  {
    tokens: ['get-childitem'],
    arity: 1,
    description: 'list files and folders',
    showAsPreset: false,
  },
  { tokens: ['ls'], arity: 1, description: 'list files and folders', showAsPreset: true },
  { tokens: ['dir'], arity: 1, description: 'list files and folders', showAsPreset: false },
  { tokens: ['pwd'], arity: 1, description: 'show the current folder', showAsPreset: false },
  { tokens: ['cd'], arity: 1, description: 'change folders', showAsPreset: true },
  { tokens: ['mkdir'], arity: 1, description: 'create folders', showAsPreset: true },
  { tokens: ['md'], arity: 1, description: 'create folders', showAsPreset: false },
  { tokens: ['rmdir'], arity: 1, description: 'delete folders', showAsPreset: false },
  { tokens: ['rd'], arity: 1, description: 'delete folders', showAsPreset: false },
  { tokens: ['copy'], arity: 1, description: 'copy files and folders', showAsPreset: false },
  { tokens: ['cp'], arity: 1, description: 'copy files and folders', showAsPreset: true },
  { tokens: ['move'], arity: 1, description: 'move files and folders', showAsPreset: false },
  { tokens: ['mv'], arity: 1, description: 'move files and folders', showAsPreset: true },
  { tokens: ['ren'], arity: 1, description: 'rename files and folders', showAsPreset: false },
  { tokens: ['rename'], arity: 1, description: 'rename files and folders', showAsPreset: false },
  { tokens: ['del'], arity: 1, description: 'delete files and folders', showAsPreset: false },
  { tokens: ['erase'], arity: 1, description: 'delete files and folders', showAsPreset: false },
  { tokens: ['rm'], arity: 1, description: 'delete files and folders', showAsPreset: true },
  { tokens: ['cat'], arity: 1, description: 'read file text', showAsPreset: true },
  { tokens: ['type'], arity: 1, description: 'read file text', showAsPreset: false },
  { tokens: ['more'], arity: 1, description: 'read file text', showAsPreset: false },
  { tokens: ['findstr'], arity: 1, description: 'search text in files', showAsPreset: false },
  { tokens: ['find'], arity: 1, description: 'search text in files', showAsPreset: true },
  { tokens: ['grep'], arity: 1, description: 'search text in files', showAsPreset: true },
  { tokens: ['where'], arity: 1, description: 'find files or commands', showAsPreset: false },
  { tokens: ['which'], arity: 1, description: 'find files or commands', showAsPreset: false },
].sort((a, b) => b.tokens.length - a.tokens.length);
