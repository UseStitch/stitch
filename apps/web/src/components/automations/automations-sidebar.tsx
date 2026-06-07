import { BotIcon, PlusIcon } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { automationsSidebarListQueryOptions } from '@/lib/queries/automations';
import { useAutomationStore } from '@/stores/automation-store';

export function AutomationsSidebarContent() {
  const params = useParams({ strict: false });

  const openCreateDialog = useAutomationStore((state) => state.openCreateDialog);

  const { data: automations = [] } = useQuery(automationsSidebarListQueryOptions);
  const selectedAutomationId = typeof params.automationId === 'string' ? params.automationId : null;

  return (
    <>
      <InternalSidebar.Header>
        <InternalSidebar.Top>
          <InternalSidebar.TopTitle>
            <BotIcon className="size-4" />
            <span className="truncate">Automations</span>
          </InternalSidebar.TopTitle>
          <InternalSidebar.TopAction onClick={openCreateDialog} aria-label="Create automation">
            <PlusIcon className="size-3.5" />
          </InternalSidebar.TopAction>
        </InternalSidebar.Top>
      </InternalSidebar.Header>

      <InternalSidebar.Content>
        {automations.length > 0 ? (
          <InternalSidebar.Group title="All automations">
            <InternalSidebar.List>
              {automations.map((automation) => (
                <InternalSidebar.Item
                  key={automation.id}
                  isActive={automation.id === selectedAutomationId}
                  render={
                    <Link
                      to="/automations/$automationId"
                      params={{ automationId: automation.id }}
                      className="truncate"
                    />
                  }
                >
                  <span className="truncate">{automation.title}</span>
                </InternalSidebar.Item>
              ))}
            </InternalSidebar.List>
          </InternalSidebar.Group>
        ) : (
          <InternalSidebar.EmptyState
            icon={BotIcon}
            title="No automations yet"
            description="Create one to prefill and start sessions faster."
          />
        )}
      </InternalSidebar.Content>
    </>
  );
}
