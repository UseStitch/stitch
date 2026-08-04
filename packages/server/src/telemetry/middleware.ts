import { ID_PREFIXES, isIdOfType } from '@stitch/shared/id';
import { TELEMETRY_HEADER_ENABLED, TELEMETRY_HEADER_ID } from '@stitch/shared/telemetry/types';

import { getServerInstallationId } from '@/telemetry/identity.js';
import { isServerTelemetryEnabled } from '@/telemetry/service.js';
import type { Context, MiddlewareHandler } from 'hono';

type TelemetryContext = { enabled: boolean; clientInstallationId: string | null; serverInstallationId: string };

const TELEMETRY_CONTEXT_KEY = 'telemetryContext';

/**
 * Hono middleware that extracts telemetry context from request headers
 * and makes it available via `c.get('telemetryContext')`.
 */
export function telemetryMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const context = extractTelemetryContext(c);
    c.set(TELEMETRY_CONTEXT_KEY, context);
    await next();
  };
}

function extractTelemetryContext(c: Context): TelemetryContext {
  if (!isServerTelemetryEnabled()) {
    return { enabled: false, clientInstallationId: null, serverInstallationId: getServerInstallationId() };
  }

  const enabledHeader = c.req.header(TELEMETRY_HEADER_ENABLED);
  if (enabledHeader === 'false') {
    return { enabled: false, clientInstallationId: null, serverInstallationId: getServerInstallationId() };
  }

  const idHeader = c.req.header(TELEMETRY_HEADER_ID);
  const clientInstallationId = idHeader && isIdOfType(idHeader, ID_PREFIXES.telemetryClient) ? idHeader : null;

  return {
    enabled: enabledHeader === 'true' && clientInstallationId !== null,
    clientInstallationId,
    serverInstallationId: getServerInstallationId(),
  };
}
