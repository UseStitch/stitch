import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { BotIcon, CheckIcon, ChevronDownIcon } from 'lucide-react';

import type { Agent } from '@stitch/shared/agents/types';
import type { PrefixedString } from '@stitch/shared/id';

import { cn } from '@/lib/utils';

type AgentSelectorPopoverProps = {
  selectedValue: PrefixedString<'agt'> | null;
  onSelect: (value: PrefixedString<'agt'>) => void;
  agents: Agent[];
};

export function AgentSelectorPopover({ selectedValue, onSelect, agents }: AgentSelectorPopoverProps) {
  const selectedOption = selectedValue ? agents.find((agent) => agent.id === selectedValue) : null;

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
      >
        <BotIcon className="size-3.5 shrink-0" />
        <span>{selectedOption?.name ?? 'Select agent'}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="top" sideOffset={6} align="start" className="isolate z-50">
          <PopoverPrimitive.Popup
            className={cn(
              'bg-popover text-popover-foreground rounded-lg shadow-lg ring-1 ring-foreground/10',
              'data-open:animate-in data-closed:animate-out',
              'data-closed:fade-out-0 data-open:fade-in-0',
              'data-closed:zoom-out-95 data-open:zoom-in-95',
              'data-[side=top]:slide-in-from-bottom-2',
              'w-64 max-h-80 flex flex-col origin-(--transform-origin) outline-none duration-100',
            )}
          >
            <div className="no-scrollbar max-h-70 overflow-y-auto overscroll-contain">
              <div className="p-1">
                {agents.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">No agents found</p>
                )}
                {agents.map((agent) => {
                  const isSelected = selectedValue === agent.id;
                  return (
                    <PopoverPrimitive.Close
                      key={agent.id}
                      onClick={() => onSelect(agent.id)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-default',
                        'transition-colors hover:bg-accent hover:text-accent-foreground',
                        'focus-visible:outline-none focus-visible:bg-accent',
                        isSelected && 'font-medium',
                      )}
                    >
                      <span>{agent.name}</span>
                      {isSelected && <CheckIcon className="size-3.5 shrink-0" />}
                    </PopoverPrimitive.Close>
                  );
                })}
              </div>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
