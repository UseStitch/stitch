import { googleConnector } from '@/connectors/definitions/google.js';
import { registerConnector } from '@/connectors/registry.js';

export function registerAllConnectors(): void {
  registerConnector(googleConnector);
}
