/**
 * Scope constants and helpers for determining which Google services
 * a connector instance has access to.
 */

/** Canonical Google OAuth scope constants. */
export const GOOGLE_SCOPE_OPENID = 'openid';
export const GOOGLE_SCOPE_USERINFO_EMAIL = 'https://www.googleapis.com/auth/userinfo.email';

export const GOOGLE_SCOPE_GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';
export const GOOGLE_SCOPE_GMAIL_SEND = 'https://www.googleapis.com/auth/gmail.send';
export const GOOGLE_SCOPE_GMAIL_MODIFY = 'https://www.googleapis.com/auth/gmail.modify';

export const GOOGLE_SCOPE_DRIVE_READONLY = 'https://www.googleapis.com/auth/drive.readonly';
export const GOOGLE_SCOPE_DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive';

export const GOOGLE_SCOPE_CALENDAR_READONLY = 'https://www.googleapis.com/auth/calendar.readonly';
export const GOOGLE_SCOPE_CALENDAR_EVENTS = 'https://www.googleapis.com/auth/calendar.events';
export const GOOGLE_SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar';

export const GOOGLE_SCOPE_DOCS_READONLY = 'https://www.googleapis.com/auth/documents.readonly';
export const GOOGLE_SCOPE_DOCS = 'https://www.googleapis.com/auth/documents';

/** Scope groups by Google service. */
export const GMAIL_SCOPES = [
  GOOGLE_SCOPE_GMAIL_READONLY,
  GOOGLE_SCOPE_GMAIL_SEND,
  GOOGLE_SCOPE_GMAIL_MODIFY,
] as const;

export const DRIVE_SCOPES = [
  GOOGLE_SCOPE_DRIVE_READONLY,
  GOOGLE_SCOPE_DRIVE_FILE,
  GOOGLE_SCOPE_DRIVE,
] as const;

export const CALENDAR_SCOPES = [
  GOOGLE_SCOPE_CALENDAR_READONLY,
  GOOGLE_SCOPE_CALENDAR_EVENTS,
  GOOGLE_SCOPE_CALENDAR,
] as const;

export const DOCS_SCOPES = [GOOGLE_SCOPE_DOCS_READONLY, GOOGLE_SCOPE_DOCS] as const;

export const GOOGLE_DEFAULT_SCOPES = [
  GOOGLE_SCOPE_OPENID,
  GOOGLE_SCOPE_USERINFO_EMAIL,
  GOOGLE_SCOPE_GMAIL_READONLY,
  GOOGLE_SCOPE_DRIVE_READONLY,
  GOOGLE_SCOPE_CALENDAR_READONLY,
] as const;

export type GoogleService = 'gmail' | 'drive' | 'calendar' | 'docs';

const SERVICE_SCOPE_MAP: Record<GoogleService, readonly string[]> = {
  gmail: GMAIL_SCOPES,
  drive: DRIVE_SCOPES,
  calendar: CALENDAR_SCOPES,
  docs: DOCS_SCOPES,
};

/** Check if the granted scopes include access to a specific Google service. */
export function hasServiceAccess(grantedScopes: string[], service: GoogleService): boolean {
  const required = SERVICE_SCOPE_MAP[service];
  return grantedScopes.some((s) => required.includes(s));
}

/** Return the list of Google services available for the given scopes. */
export function getAvailableServices(grantedScopes: string[]): GoogleService[] {
  return (['gmail', 'drive', 'calendar', 'docs'] as const).filter((service) =>
    hasServiceAccess(grantedScopes, service),
  );
}

/** Check if the granted scopes include write access for a service. */
export function hasWriteAccess(grantedScopes: string[], service: GoogleService): boolean {
  if (service === 'gmail') {
    return grantedScopes.some(
      (s) => s === GOOGLE_SCOPE_GMAIL_SEND || s === GOOGLE_SCOPE_GMAIL_MODIFY,
    );
  }
  if (service === 'drive') {
    return grantedScopes.some((s) => s === GOOGLE_SCOPE_DRIVE_FILE || s === GOOGLE_SCOPE_DRIVE);
  }
  if (service === 'calendar') {
    return grantedScopes.some(
      (s) => s === GOOGLE_SCOPE_CALENDAR_EVENTS || s === GOOGLE_SCOPE_CALENDAR,
    );
  }
  if (service === 'docs') {
    return grantedScopes.some((s) => s === GOOGLE_SCOPE_DOCS);
  }
  return false;
}
