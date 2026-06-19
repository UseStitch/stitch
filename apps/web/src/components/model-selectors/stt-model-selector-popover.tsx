import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react';
import * as React from 'react';

import type { SttProviderModels } from '@stitch/shared/stt/types';

import { cn } from '@/lib/utils';

export type SttModelSelection = {
  providerId: string;
  modelId: string;
};

type SttModelSelectorPopoverProps = {
  defaultValue: SttModelSelection | null;
  onSelect: (value: SttModelSelection) => void;
  sttProviders: SttProviderModels[];
  /**
   * Element to render as the popover trigger. When omitted a standalone
   * caret icon button is used. Pass a `<Button>` (or similar) to embed
   * the trigger inside a ButtonGroup.
   */
  triggerRender?: React.ReactElement;
};

export function SttModelSelectorPopover({
  defaultValue,
  onSelect,
  sttProviders,
  triggerRender,
}: SttModelSelectorPopoverProps) {
  const [search, setSearch] = React.useState('');

  const filtered = React.useMemo(() => {
    if (!search.trim()) return sttProviders;
    const lower = search.toLowerCase();
    return sttProviders
      .map((provider) => ({
        ...provider,
        models: provider.models.filter(
          (m) =>
            m.name.toLowerCase().includes(lower) ||
            provider.providerName.toLowerCase().includes(lower),
        ),
      }))
      .filter((p) => p.models.length > 0);
  }, [sttProviders, search]);

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        render={triggerRender}
        title="Choose STT model"
        className={
          triggerRender
            ? undefined
            : cn(
                'flex items-center justify-center rounded-md p-1 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )
        }
      >
        {!triggerRender && <ChevronDownIcon className="size-3 shrink-0" />}
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="top"
          sideOffset={6}
          align="start"
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            className={cn(
              'bg-popover text-popover-foreground rounded-lg shadow-lg ring-1 ring-foreground/10',
              'data-open:animate-in data-closed:animate-out',
              'data-closed:fade-out-0 data-open:fade-in-0',
              'data-closed:zoom-out-95 data-open:zoom-in-95',
              'data-[side=top]:slide-in-from-bottom-2',
              'w-72 max-h-80 flex flex-col origin-(--transform-origin) outline-none duration-100',
            )}
          >
            <div className="border-b border-border/50 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">STT Model</p>
            </div>

            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
              <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search models"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="no-scrollbar max-h-60 overflow-y-auto overscroll-contain">
              <div className="p-1">
                {filtered.map((provider, index) => (
                  <div key={provider.providerId}>
                    {index > 0 && <div className="my-1 h-px bg-border/50" />}
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      {provider.providerName}
                    </p>
                    {provider.models.map((model) => {
                      const isDefault =
                        defaultValue?.providerId === provider.providerId &&
                        defaultValue?.modelId === model.id;
                      return (
                        <PopoverPrimitive.Close
                          key={model.id}
                          onClick={() =>
                            onSelect({ providerId: provider.providerId, modelId: model.id })
                          }
                          className={cn(
                            'w-full flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-default',
                            'transition-colors hover:bg-accent hover:text-accent-foreground',
                            'focus-visible:outline-none focus-visible:bg-accent',
                            isDefault && 'font-medium',
                          )}
                        >
                          <span>{model.name}</span>
                          {isDefault && <CheckIcon className="size-3.5 shrink-0" />}
                        </PopoverPrimitive.Close>
                      );
                    })}
                  </div>
                ))}

                {filtered.length === 0 && search.trim() && (
                  <p className="py-4 text-center text-xs text-muted-foreground">No models found</p>
                )}
              </div>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
