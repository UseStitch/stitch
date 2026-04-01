import { registerConnector } from '@/connectors/registry.js';
import { googleConnector } from '@/connectors/definitions/google.js';
import { slackConnector } from '@/connectors/definitions/slack.js';

export function registerAllConnectors(): void {
  registerConnector(googleConnector);
  registerConnector(slackConnector);
}
