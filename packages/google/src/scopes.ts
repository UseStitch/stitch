/**
 * Scope constants and helpers for determining which Google services
 * a connector instance has access to.
 */

/** Scope prefixes grouped by Google service */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
] as const;

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
] as const;

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar',
] as const;

export type GoogleService = 'gmail' | 'drive' | 'calendar';

const SERVICE_SCOPE_MAP: Record<GoogleService, readonly string[]> = {
  gmail: GMAIL_SCOPES,
  drive: DRIVE_SCOPES,
  calendar: CALENDAR_SCOPES,
};

/** Check if the granted scopes include access to a specific Google service. */
export function hasServiceAccess(grantedScopes: string[], service: GoogleService): boolean {
  const required = SERVICE_SCOPE_MAP[service];
  return grantedScopes.some((s) => required.includes(s));
}

/** Return the list of Google services available for the given scopes. */
export function getAvailableServices(grantedScopes: string[]): GoogleService[] {
  return (['gmail', 'drive', 'calendar'] as const).filter((service) =>
    hasServiceAccess(grantedScopes, service),
  );
}

/** Check if the granted scopes include write access for a service. */
export function hasWriteAccess(grantedScopes: string[], service: GoogleService): boolean {
  if (service === 'gmail') {
    return grantedScopes.some(
      (s) =>
        s === 'https://www.googleapis.com/auth/gmail.send' ||
        s === 'https://www.googleapis.com/auth/gmail.modify',
    );
  }
  if (service === 'drive') {
    return grantedScopes.some(
      (s) =>
        s === 'https://www.googleapis.com/auth/drive.file' ||
        s === 'https://www.googleapis.com/auth/drive',
    );
  }
  if (service === 'calendar') {
    return grantedScopes.some(
      (s) =>
        s === 'https://www.googleapis.com/auth/calendar.events' ||
        s === 'https://www.googleapis.com/auth/calendar',
    );
  }
  return false;
}
