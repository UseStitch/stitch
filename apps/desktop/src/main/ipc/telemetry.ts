import { getTelemetryState, setTelemetryEnabled } from '../telemetry-state.js';
import { registerIpcHandler } from './register.js';

export function registerTelemetryHandlers(): void {
  registerIpcHandler('telemetry:getState', () => {
    return getTelemetryState();
  });

  registerIpcHandler('telemetry:setEnabled', (_event, enabled) => {
    return setTelemetryEnabled(enabled);
  });
}
