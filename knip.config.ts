import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [],
      project: [],
    },
    'apps/*': {
      entry: ['src/index.{ts,tsx}', 'src/main.{ts,tsx}', 'src/app.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
    },
    'packages/*': {
      entry: ['src/index.{ts,tsx}'],
      project: ['src/**/*.{ts,tsx}'],
    },
  },

}

export default config
