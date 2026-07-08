import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  includeEntryExports: true,
  workspaces: {
    '.': { entry: [], project: [] },
    'apps/web': {
      entry: ['src/routes/**/*.{ts,tsx}', 'src/main.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
      ignore: ['src/components/ui/**'],
    },
    'apps/website': {
      entry: ['src/main.ts', 'functions/**/*.ts'],
      project: ['src/**/*.ts', 'functions/**/*.ts'],
      ignore: ['functions/**/*.ts'],
    },
    'apps/desktop': {
      entry: ['src/main/index.ts', 'src/preload/index.ts', 'src/**/*.test.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
    },
    'packages/shared': { entry: ['src/**/*.ts', 'src/**/*.test.{ts,tsx}'], project: ['src/**/*.ts'] },
    'packages/*': { entry: ['src/index.{ts,tsx}', 'src/**/*.test.{ts,tsx}'], project: ['src/**/*.{ts,tsx}'] },
    'packages/server': {
      entry: ['src/index.{ts,tsx}', 'src/code-mode/sandbox-process.ts', 'src/**/*.test.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
    },
    'packages/audio-capture': {
      entry: ['src/index.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
    },
    'packages/mail': {
      entry: ['src/**/*.test.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
      ignore: ['src/providers/gmail/api.ts', 'src/providers/gmail/batch.ts', 'src/providers/gmail/parse.ts'],
    },
    'connectors/*': { entry: ['src/index.{ts,tsx}', 'src/**/*.test.{ts,tsx}'], project: ['src/**/*.{ts,tsx}'] },
    'connectors/sdk': { entry: ['src/index.{ts,tsx}'], project: ['src/**/*.{ts,tsx}'] },
  },
  ignoreDependencies: [
    'oxfmt',
    'oxlint',
    'oxlint-tsgolint',
    // Referenced via CSS @import / @plugin in apps/web/src/styles/global.css, not TS imports
    'katex',
    'shadcn',
    'tw-animate-css',
    'tailwindcss',
    '@tailwindcss/typography',
  ],
  ignoreIssues: { 'apps/web/src/routes/mail/**': ['exports'], 'apps/web/src/routes/settings/mail.tsx': ['exports'] },
  ignoreBinaries: [],
};

export default config;
