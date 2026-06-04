import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['@stitch/audio-capture'],
      },
    },
  },
  preload: {},
});
