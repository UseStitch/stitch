// Runs synchronously before the app bundle so the very first paint uses the
// correct themed background, avoiding a white flash on launch. Mirrors the
// approach in opencode's oc-theme-preload.js. The cached values are written by
// applyAppearanceMode/injectThemeCss in src/lib/theme.ts on every launch.
(function () {
  // The transparent desktop-notification window shares this HTML; skip it so we
  // don't paint an opaque background over its transparency.
  if (location.hash.indexOf('#/desktop-notifications') === 0) return;

  var FALLBACK_LIGHT = 'oklch(1 0 0)';
  var FALLBACK_DARK = 'oklch(0.145 0 0)';

  var mode = localStorage.getItem('stitch.appearance.mode') || 'system';
  var prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  var isDark = mode === 'dark' || (mode === 'system' && prefersDark);

  var light = localStorage.getItem('stitch.splash.bg.light') || FALLBACK_LIGHT;
  var dark = localStorage.getItem('stitch.splash.bg.dark') || FALLBACK_DARK;
  var background = isDark ? dark : light;

  document.documentElement.style.backgroundColor = background;
  if (isDark) document.documentElement.classList.add('dark');
})();
