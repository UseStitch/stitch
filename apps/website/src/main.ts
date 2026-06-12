import './styles.css';

// Close open dropdowns on outside click
document.addEventListener('click', function (e) {
  document.querySelectorAll('.btn-group[open]').forEach(function (d) {
    if (!d.contains(e.target)) d.removeAttribute('open');
  });
});

// Theme toggle
(function () {
  var stored = localStorage.getItem('theme');
  if (stored) {
    document.documentElement.setAttribute('data-theme', stored);
  }

  document.getElementById('theme-toggle').addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme');
    var isLight;

    if (current) {
      isLight = current === 'light';
    } else {
      isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    }

    var next = isLight ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
})();
