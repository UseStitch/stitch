import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  includeEntryExports: true,
  workspaces: {
    '.': {
      entry: [],
      project: [],
    },
    'apps/web': {
      entry: ['src/routes/**/*.{ts,tsx}', 'src/main.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
      ignore: ['src/components/ui/**'],
    },
    'apps/desktop': {
      entry: ['src/main/index.ts', 'src/preload/index.ts'],
      project: ['src/**/*.{ts,tsx}'],
    },
    'packages/shared': {
      entry: ['src/**/*.ts', '__test__/**/*.test.{ts,tsx}'],
      project: ['src/**/*.ts'],
    },
    'packages/*': {
      entry: ['src/index.{ts,tsx}', '__test__/**/*.test.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
    },
    'packages/audio-capture': {
      entry: ['src/index.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
    },
    'connectors/*': {
      entry: ['src/index.{ts,tsx}', 'src/__test__/**/*.test.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
    },
    'connectors/sdk': {
      entry: ['src/index.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
    },
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
    // Loaded at runtime as pino.transport() string targets, not static imports
    'pino-roll',
    'pino-pretty',
  ],
  ignoreBinaries: [],
};

export default config;
