import { createFileRoute } from '@tanstack/react-router';

import { AutomationsPage } from '@/components/automations/automations-page';

export const Route = createFileRoute('/automations/')({
  component: RouteComponent,
});

function RouteComponent() {
  return <AutomationsPage />;
}
