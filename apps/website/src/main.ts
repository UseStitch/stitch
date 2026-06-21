import posthog from 'posthog-js';

import './styles.css';

// PostHog init
const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
  });
}

// Close open dropdowns on outside click
document.addEventListener('click', (e: MouseEvent) => {
  document.querySelectorAll('.btn-group[open]').forEach((d) => {
    if (!d.contains(e.target as Node)) d.removeAttribute('open');
  });
});

document.addEventListener('click', (e: MouseEvent) => {
  if (!(e.target instanceof Element)) return;

  const downloadLink = e.target.closest<HTMLAnchorElement>('a[data-app-download-platform]');

  if (!downloadLink || !posthogKey) return;

  posthog.capture('app_download', {
    platform: downloadLink.dataset.appDownloadPlatform,
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

// Waitlist dialog
(() => {
  const dialog = document.getElementById('waitlist-dialog') as HTMLDialogElement;
  const openBtn = document.getElementById('open-waitlist-dialog')!;
  const closeBtn = document.getElementById('close-waitlist-dialog')!;
  const form = document.getElementById('waitlist-form') as HTMLFormElement;
  const successMsg = document.getElementById('waitlist-success')!;

  openBtn.addEventListener('click', () => {
    dialog.showModal();
  });

  closeBtn.addEventListener('click', () => {
    dialog.close();
  });

  dialog.addEventListener('click', (e: MouseEvent) => {
    if (e.target === dialog) dialog.close();
  });

  form.addEventListener('submit', (e: SubmitEvent) => {
    e.preventDefault();

    const email = (document.getElementById('waitlist-email') as HTMLInputElement).value;
    const inference = (form.elements.namedItem('interest-inference') as HTMLInputElement).checked;
    const remote = (form.elements.namedItem('interest-remote') as HTMLInputElement).checked;

    if (posthogKey) {
      posthog.identify(email);
      posthog.capture('waitlist_signup', {
        email,
        interest_inference: inference,
        interest_remote: remote,
      });
    }

    form.hidden = true;
    successMsg.hidden = false;
  });
})();
