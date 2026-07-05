import type { PrefixedString } from '../id/index.js';
import type { PermissionResponse } from './types.js';

export type PermissionResponseRequestedPayload = { permissionResponse: PermissionResponse };

export type PermissionResponseResolvedPayload = {
  permissionResponseId: PrefixedString<'permres'>;
  sessionId: PrefixedString<'ses'>;
};

export const PERMISSION_EVENT_NAMES = ['permission-response-requested', 'permission-response-resolved'] as const;

export type PermissionEvents = {
  'permission-response-requested': PermissionResponseRequestedPayload;
  'permission-response-resolved': PermissionResponseResolvedPayload;
};
