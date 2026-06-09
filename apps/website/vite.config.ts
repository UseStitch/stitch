import { defineConfig, type Plugin } from 'vite';

/**
 * In dev mode, CSS imported from JS is injected after first paint (FOUC).
 * This plugin adds the stylesheet as a render-blocking <link> in dev only.
 * In production, Vite's build already extracts CSS to a <link> in <head>.
 */
function cssDevLink(): Plugin {
  return {
    name: 'css-dev-link',
    apply: 'serve',
    transformIndexHtml() {
      return [
        {
          tag: 'link',
          attrs: { rel: 'stylesheet', href: '/src/styles.css' },
          injectTo: 'head',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [cssDevLink()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
