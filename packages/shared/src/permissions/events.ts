import type { PrefixedString } from '../id/index.js';
import type { PermissionResponse } from './types.js';

type PermissionResponseRequestedPayload = { permissionResponse: PermissionResponse };

type PermissionResponseResolvedPayload = {
  permissionResponseId: PrefixedString<'permres'>;
  sessionId: PrefixedString<'ses'>;
};

export const PERMISSION_EVENT_NAMES = ['permission.requested', 'permission.resolved'] as const;

export type PermissionEvents = {
  'permission.requested': PermissionResponseRequestedPayload;
  'permission.resolved': PermissionResponseResolvedPayload;
};
