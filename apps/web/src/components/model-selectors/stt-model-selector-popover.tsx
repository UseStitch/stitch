import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react';
import * as React from 'react';

import type { SttProviderModels } from '@stitch/shared/stt/types';

import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';
import { Input } from '@/components/ui/input';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from 'cnfast';


export type SttModelSelection = { providerId: string; modelId: string };

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

  const lower = search.toLowerCase();
  const filtered = !search.trim()
    ? sttProviders
    : sttProviders.reduce<typeof sttProviders>((acc, provider) => {
        const models = provider.models.filter(
          (m) => m.name.toLowerCase().includes(lower) || provider.providerName.toLowerCase().includes(lower),
        );
        if (models.length > 0) acc.push({ ...provider, models });
        return acc;
      }, []);

  return (
    <Popover>
      <PopoverTrigger
        render={triggerRender}
        title="Choose STT model"
        className={
          triggerRender
            ? undefined
            : cn(
                'flex items-center justify-center rounded-md p-space-xs transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'text-muted-foreground hover:text-foreground hover:bg-accent',
              )
        }>
        {!triggerRender && <Icon as={ChevronDownIcon} size="xs" />}
      </PopoverTrigger>

      <PopoverContent
        side="top"
        sideOffset={6}
        align="start"
        className="max-h-80 w-72 gap-space-none p-space-none shadow-lg outline-none">
        <div className="border-b border-border-subtle px-space-l py-space-m">
          <Text variant="label" tone="muted">
            STT Model
          </Text>
        </div>

        <div className="flex items-center gap-space-m border-b border-border-subtle px-space-l py-space-m">
          <Icon as={SearchIcon} size="s" color="var(--muted-foreground)" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search models"
            className="h-auto flex-1 rounded-none border-0 bg-transparent px-space-none py-space-none text-sm focus-visible:ring-0"
          />
        </div>

        <div className="no-scrollbar max-h-60 overflow-y-auto overscroll-contain">
          <div className="p-space-xs">
            {filtered.map((provider, index) => (
              <div key={provider.providerId}>
                {index > 0 && <div className="my-space-xs h-px bg-border-subtle" />}
                <div className="px-space-m py-space-xs">
                  <Text variant="label" tone="muted">
                    {provider.providerName}
                  </Text>
                </div>
                {provider.models.map((model) => {
                  const isDefault =
                    defaultValue?.providerId === provider.providerId && defaultValue?.modelId === model.id;
                  return (
                    <PopoverClose
                      key={model.id}
                      onClick={() => onSelect({ providerId: provider.providerId, modelId: model.id })}
                      className={cn(
                        'w-full flex items-center justify-between rounded-md px-space-m py-space-s text-sm cursor-default',
                        'transition-colors hover:bg-accent hover:text-accent-foreground',
                        'focus-visible:outline-none focus-visible:bg-accent',
                        isDefault && 'font-medium',
                      )}>
                      <span>{model.name}</span>
                      {isDefault && <Icon as={CheckIcon} size="s" />}
                    </PopoverClose>
                  );
                })}
              </div>
            ))}

            {filtered.length === 0 && search.trim() && (
              <div className="py-space-xl text-center">
                <Text variant="caption" tone="muted">
                  No models found
                </Text>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
