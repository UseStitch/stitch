/**
 * Scope constants and helpers for determining which Google services
 * a connector instance has access to.
 */

/** Canonical Google OAuth scope constants. */
const GOOGLE_SCOPE_OPENID = 'openid';
export const GOOGLE_SCOPE_USERINFO_EMAIL = 'https://www.googleapis.com/auth/userinfo.email';

export const GOOGLE_SCOPE_GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';
export const GOOGLE_SCOPE_GMAIL_SEND = 'https://www.googleapis.com/auth/gmail.send';
export const GOOGLE_SCOPE_GMAIL_MODIFY = 'https://www.googleapis.com/auth/gmail.modify';
export const GOOGLE_SCOPE_GMAIL_SETTINGS_BASIC = 'https://www.googleapis.com/auth/gmail.settings.basic';

export const GOOGLE_SCOPE_DRIVE_READONLY = 'https://www.googleapis.com/auth/drive.readonly';
export const GOOGLE_SCOPE_DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive';

export const GOOGLE_SCOPE_CALENDAR_READONLY = 'https://www.googleapis.com/auth/calendar.readonly';
export const GOOGLE_SCOPE_CALENDAR_EVENTS = 'https://www.googleapis.com/auth/calendar.events';
export const GOOGLE_SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar';

export const GOOGLE_SCOPE_DOCS_READONLY = 'https://www.googleapis.com/auth/documents.readonly';
export const GOOGLE_SCOPE_DOCS = 'https://www.googleapis.com/auth/documents';

/** Scope groups by Google service. */
const GMAIL_SCOPES = [GOOGLE_SCOPE_GMAIL_READONLY, GOOGLE_SCOPE_GMAIL_SEND, GOOGLE_SCOPE_GMAIL_MODIFY] as const;

const DRIVE_SCOPES = [GOOGLE_SCOPE_DRIVE_READONLY, GOOGLE_SCOPE_DRIVE_FILE, GOOGLE_SCOPE_DRIVE] as const;

const CALENDAR_SCOPES = [GOOGLE_SCOPE_CALENDAR_READONLY, GOOGLE_SCOPE_CALENDAR_EVENTS, GOOGLE_SCOPE_CALENDAR] as const;

const DOCS_SCOPES = [GOOGLE_SCOPE_DOCS_READONLY, GOOGLE_SCOPE_DOCS] as const;

export const GOOGLE_DEFAULT_SCOPES = [
  GOOGLE_SCOPE_OPENID,
  GOOGLE_SCOPE_USERINFO_EMAIL,
  GOOGLE_SCOPE_GMAIL_READONLY,
  GOOGLE_SCOPE_DRIVE_READONLY,
  GOOGLE_SCOPE_CALENDAR_READONLY,
] as const;

type GoogleService = 'gmail' | 'drive' | 'calendar' | 'docs';

const SERVICE_SCOPE_MAP: Record<GoogleService, readonly string[]> = {
  gmail: GMAIL_SCOPES,
  drive: DRIVE_SCOPES,
  calendar: CALENDAR_SCOPES,
  docs: DOCS_SCOPES,
};

const SERVICE_WRITE_SCOPE_MAP: Record<Exclude<GoogleService, 'gmail'>, readonly string[]> = {
  drive: [GOOGLE_SCOPE_DRIVE_FILE, GOOGLE_SCOPE_DRIVE],
  calendar: [GOOGLE_SCOPE_CALENDAR_EVENTS, GOOGLE_SCOPE_CALENDAR],
  docs: [GOOGLE_SCOPE_DOCS],
};

/** Check if the granted scopes include access to a specific Google service. */
export function hasServiceAccess(grantedScopes: string[], service: GoogleService): boolean {
  const required = SERVICE_SCOPE_MAP[service];
  return grantedScopes.some((s) => required.includes(s));
}

/** Check if the granted scopes include write access for a service. */
export function hasWriteAccess(grantedScopes: string[], service: Exclude<GoogleService, 'gmail'>): boolean {
  const writeScopes = SERVICE_WRITE_SCOPE_MAP[service];
  return grantedScopes.some((s) => writeScopes.includes(s));
}

/** Check if granted scopes can send Gmail messages. */
export function hasGmailSendAccess(grantedScopes: string[]): boolean {
  return grantedScopes.some((s) => s === GOOGLE_SCOPE_GMAIL_SEND || s === GOOGLE_SCOPE_GMAIL_MODIFY);
}

/** Check if granted scopes can modify Gmail resources (labels, message labels). */
export function hasGmailModifyAccess(grantedScopes: string[]): boolean {
  return grantedScopes.some((s) => s === GOOGLE_SCOPE_GMAIL_MODIFY);
}

/** Check if granted scopes can manage Gmail settings (filters, etc.). */
export function hasGmailSettingsAccess(grantedScopes: string[]): boolean {
  return grantedScopes.some((s) => s === GOOGLE_SCOPE_GMAIL_SETTINGS_BASIC);
}
