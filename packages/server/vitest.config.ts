import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['__test__/**/*.test.ts'],
    setupFiles: [path.resolve(__dirname, '__test__/setup.ts')],
  },
});
