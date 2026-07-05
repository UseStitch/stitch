/** Domains whose popups are auth-related and should open in the system browser. */
const AUTH_POPUP_DOMAINS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
  'github.com/login',
  'github.com/sessions',
  'auth0.com',
  'okta.com',
  'login.yahoo.com',
  'id.atlassian.com',
];

export function isAuthPopupUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const fullHost = parsed.hostname + parsed.pathname;
    return AUTH_POPUP_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain) || fullHost.startsWith(domain),
    );
  } catch {
    return false;
  }
}
