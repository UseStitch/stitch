import { BotIcon, PlusIcon } from 'lucide-react';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InfiniteLoadTrigger } from '@/components/ui/infinite-load-trigger';
import { useInfiniteLoadObserver } from '@/hooks/use-infinite-load-observer';
import { automationsSidebarListQueryOptions } from '@/lib/queries/automations';
import { useAutomationStore } from '@/stores/automation-store';

export function AutomationsSidebarContent() {
  const params = useParams({ strict: false });

  const openCreateDialog = useAutomationStore((state) => state.openCreateDialog);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(automationsSidebarListQueryOptions);
  const automations = data?.pages.flatMap((result) => result.automations) ?? [];
  const loadMoreRef = useInfiniteLoadObserver({
    hasMore: hasNextPage,
    isLoading: isFetchingNextPage,
    onLoadMore: () => void fetchNextPage(),
  });
  const selectedAutomationId = typeof params.automationId === 'string' ? params.automationId : null;

  return (
    <>
      <InternalSidebar.Header>
        <InternalSidebar.Top>
          <InternalSidebar.TopTitle>
            <Icon as={BotIcon} size="m" />
            <Text as="span" variant="body" truncate>
              Automations
            </Text>
          </InternalSidebar.TopTitle>
          <InternalSidebar.TopAction onClick={openCreateDialog} aria-label="Create automation">
            <Icon as={PlusIcon} size="s" />
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
                  }>
                  <Text as="span" variant="body" truncate>
                    {automation.title}
                  </Text>
                </InternalSidebar.Item>
              ))}
            </InternalSidebar.List>
            {hasNextPage ? <InfiniteLoadTrigger sentinelRef={loadMoreRef} isLoading={isFetchingNextPage} /> : null}
          </InternalSidebar.Group>
        ) : (
          <Empty size="compact">
            <EmptyMedia variant="icon">
              <Icon as={BotIcon} size="m" />
            </EmptyMedia>
            <EmptyTitle>No automations yet</EmptyTitle>
            <EmptyDescription>Create one to prefill and start sessions faster.</EmptyDescription>
          </Empty>
        )}
      </InternalSidebar.Content>
    </>
  );
}
