import type { KnipConfig } from 'knip';

const config: KnipConfig = {
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
    'packages/*': {
      entry: ['src/index.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
    },
  },
  ignoreDependencies: [
    'oxlint',
    'oxlint-tsgolint',
    // Referenced via CSS @import / @plugin in apps/web/src/styles/global.css, not TS imports
    'katex',
    'shadcn',
    'tw-animate-css',
    'tailwindcss',
    '@tailwindcss/typography',
  ],
};

export default config;
