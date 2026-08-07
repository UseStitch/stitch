import { cn } from 'cnfast';
import { CheckIcon, ChevronDownIcon, CpuIcon, SearchIcon } from 'lucide-react';
import * as React from 'react';

import type { ModelSpec } from './types';
import {
  buildProviderModelOptions,
  filterProviderModels,
  findProviderModelOption,
} from '@/components/model-selectors/provider-model-utils';
import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { Input } from '@/components/ui/input';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ProviderModels } from '@/lib/queries/providers';

type ModelSelectorPopoverProps = {
  selectedValue: ModelSpec | null;
  onSelect: (value: ModelSpec) => void;
  providerModels: ProviderModels[];
};

export function ModelSelectorPopover({ selectedValue, onSelect, providerModels }: ModelSelectorPopoverProps) {
  const [search, setSearch] = React.useState('');

  const allOptions = buildProviderModelOptions(providerModels);
  const filtered = filterProviderModels(providerModels, search);
  const selectedOption = findProviderModelOption(allOptions, selectedValue);

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex items-center gap-space-s rounded-md px-space-m py-space-xs text-xs font-medium transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-accent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}>
        <Icon as={CpuIcon} size="s" />
        <span>{selectedOption?.modelName ?? 'Select model'}</span>
        <span className="opacity-60">
          <Icon as={ChevronDownIcon} size="xs" />
        </span>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        sideOffset={6}
        align="start"
        className="max-h-80 w-96 gap-space-none p-space-none shadow-lg outline-none">
        <div className="flex items-center gap-space-m border-b border-border-subtle px-space-l py-space-m">
          <Icon as={SearchIcon} size="s" color="var(--muted-foreground)" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search models"
            className="h-auto flex-1 rounded-none border-0 bg-transparent px-space-none py-space-none text-sm focus-visible:ring-0"
          />
        </div>

        <div className="no-scrollbar max-h-70 overflow-y-auto overscroll-contain">
          <div className="p-space-xs">
            {filtered.length === 0 && (
              <div className="py-space-xl text-center">
                <Text as="p" variant="caption" tone="muted">
                  No models found
                </Text>
              </div>
            )}
            {filtered.map((provider, index) => (
              <div key={provider.providerId}>
                {index > 0 && <div className="my-space-xs h-px bg-border-subtle" />}
                <div className="px-space-m py-space-xs">
                  <Text as="p" variant="label" tone="muted">
                    {provider.providerName}
                  </Text>
                </div>
                {provider.models.map((model) => {
                  const isSelected =
                    selectedValue?.providerId === provider.providerId && selectedValue.modelId === model.id;
                  return (
                    <PopoverClose
                      key={model.id}
                      onClick={() => onSelect({ providerId: provider.providerId, modelId: model.id })}
                      className={cn(
                        'w-full flex items-center justify-between rounded-md px-space-m py-space-s text-sm cursor-default',
                        'transition-colors hover:bg-accent hover:text-accent-foreground',
                        'focus-visible:outline-none focus-visible:bg-accent',
                        isSelected && 'font-medium',
                      )}>
                      <span>{model.name}</span>
                      {isSelected && <Icon as={CheckIcon} size="s" />}
                    </PopoverClose>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
