import './styles.css';

// Close open dropdowns on outside click
document.addEventListener('click', (e: MouseEvent) => {
  document.querySelectorAll('.btn-group[open]').forEach((d) => {
    if (!d.contains(e.target as Node)) d.removeAttribute('open');
  });
});

// Theme toggle
(() => {
  const stored = localStorage.getItem('theme');
  if (stored) {
    document.documentElement.setAttribute('data-theme', stored);
  }

  document.getElementById('theme-toggle')!.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    let isLight: boolean;

    if (current) {
      isLight = current === 'light';
    } else {
      isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    }

    const next = isLight ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
})();
