import { googleConnector } from '@/connectors/definitions/google.js';
import { slackConnector } from '@/connectors/definitions/slack.js';
import { registerConnector } from '@/connectors/registry.js';

export function registerAllConnectors(): void {
  registerConnector(googleConnector);
  registerConnector(slackConnector);
}
