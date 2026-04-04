import { BotIcon, PlusIcon } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { automationsQueryOptions } from '@/lib/queries/automations';
import { cn } from '@/lib/utils';
import { useAutomationStore } from '@/stores/automation-store';

export function AutomationsSidebarContent() {
  const { data: automations = [] } = useQuery(automationsQueryOptions);
  const selectedAutomationId = useAutomationStore((state) => state.selectedAutomationId);
  const setSelectedAutomationId = useAutomationStore((state) => state.setSelectedAutomationId);
  const openCreateDialog = useAutomationStore((state) => state.openCreateDialog);

  return (
    <>
      <SidebarHeader className="pb-0">
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
            <BotIcon className="size-4" />
            Automations
          </div>
          <Button size="icon-sm" onClick={openCreateDialog} aria-label="Create automation">
            <PlusIcon className="size-3.5" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {automations.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>All</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {automations.map((automation) => (
                  <SidebarMenuItem key={automation.id}>
                    <SidebarMenuButton
                      isActive={automation.id === selectedAutomationId}
                      onClick={() => setSelectedAutomationId(automation.id)}
                      className="truncate"
                    >
                      <span className={cn('truncate', automation.id === selectedAutomationId && 'font-medium')}>
                        {automation.title}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <BotIcon className="size-8 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">No automations yet</p>
              <p className="text-xs text-muted-foreground/70">
                Create one to prefill and start sessions faster.
              </p>
            </div>
          </div>
        )}
      </SidebarContent>
    </>
  );
}
