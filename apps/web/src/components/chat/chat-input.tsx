import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import {
  ArrowUpIcon,
  CheckIcon,
  CpuIcon,
  SearchIcon,
  ChevronDownIcon,
  SquareIcon,
  BotIcon,
} from 'lucide-react';
import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Agent } from '@stitch/shared/agents/types';
import type { PrefixedString } from '@stitch/shared/id';

import { Button } from '@/components/ui/button';
import { agentsQueryOptions } from '@/lib/queries/agents';
import { enabledProviderModelsQueryOptions, type ProviderModels } from '@/lib/queries/providers';
import { cn } from '@/lib/utils';

const SEPARATOR = ':::';

type ModelOption = {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  value: string; // `${providerId}:::${modelId}`
};

function buildModelOptions(providerModels: ProviderModels[]): ModelOption[] {
  return providerModels.flatMap((provider) =>
    provider.models.map((model) => ({
      providerId: provider.providerId,
      providerName: provider.providerName,
      modelId: model.id,
      modelName: model.name,
      value: `${provider.providerId}${SEPARATOR}${model.id}`,
    })),
  );
}

type ModelSelectorProps = {
  selectedValue: string | null;
  onSelect: (value: string) => void;
  providerModels: ProviderModels[];
};

function ModelSelectorPopover({ selectedValue, onSelect, providerModels }: ModelSelectorProps) {
  const [search, setSearch] = React.useState('');

  const allOptions = React.useMemo(() => buildModelOptions(providerModels), [providerModels]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return providerModels;
    const q = search.toLowerCase();
    return providerModels
      .map((provider) => ({
        ...provider,
        models: provider.models.filter(
          (m) =>
            m.name.toLowerCase().includes(q) || provider.providerName.toLowerCase().includes(q),
        ),
      }))
      .filter((p) => p.models.length > 0);
  }, [providerModels, search]);

  const selectedOption = selectedValue
    ? (allOptions.find((o) => o.value === selectedValue) ?? null)
    : null;

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
      >
        <CpuIcon className="size-3.5 shrink-0" />
        <span>{selectedOption?.modelName ?? 'Select model'}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
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
              'w-96 max-h-80 flex flex-col origin-(--transform-origin) outline-none duration-100',
            )}
          >
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
              <SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            {/* List */}
            <div className="no-scrollbar max-h-70 overflow-y-auto overscroll-contain">
              <div className="p-1">
                {filtered.length === 0 && (
                  <p className="text-muted-foreground text-xs text-center py-4">No models found</p>
                )}
                {filtered.map((provider, idx) => (
                  <div key={provider.providerId}>
                    {idx > 0 && <div className="my-1 h-px bg-border/50" />}
                    <p className="text-muted-foreground px-2 py-1 text-xs font-medium">
                      {provider.providerName}
                    </p>
                    {provider.models.map((model) => {
                      const val = `${provider.providerId}${SEPARATOR}${model.id}`;
                      const isSelected = selectedValue === val;
                      return (
                        <PopoverPrimitive.Close
                          key={val}
                          onClick={() => onSelect(val)}
                          className={cn(
                            'w-full flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-default',
                            'transition-colors hover:bg-accent hover:text-accent-foreground',
                            'focus-visible:outline-none focus-visible:bg-accent',
                            isSelected && 'font-medium',
                          )}
                        >
                          <span>{model.name}</span>
                          {isSelected && <CheckIcon className="size-3.5 shrink-0" />}
                        </PopoverPrimitive.Close>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

type AgentSelectorProps = {
  selectedValue: PrefixedString<'agt'> | null;
  onSelect: (value: PrefixedString<'agt'>) => void;
  agents: Agent[];
};

function AgentSelectorPopover({ selectedValue, onSelect, agents }: AgentSelectorProps) {
  const selectedOption = selectedValue ? agents.find((a) => a.id === selectedValue) : null;

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
              'w-64 max-h-80 flex flex-col origin-(--transform-origin) outline-none duration-100',
            )}
          >
            <div className="no-scrollbar max-h-70 overflow-y-auto overscroll-contain">
              <div className="p-1">
                {agents.length === 0 && (
                  <p className="text-muted-foreground text-xs text-center py-4">No agents found</p>
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

type ChatInputInnerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  selectedModel: string | null;
  onModelChange: (value: string) => void;
  selectedAgent: string | null;
  onAgentChange: (value: PrefixedString<'agt'> | null) => void;
  placeholder?: string;
  disabled?: boolean;
  hasDockAbove?: boolean;
  embedded?: boolean;
};

function ChatInputInner({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  selectedModel,
  onModelChange,
  selectedAgent,
  onAgentChange,
  placeholder = 'Ask anything...',
  disabled,
  hasDockAbove,
  embedded,
}: ChatInputInnerProps) {
  const { data: providerModels } = useSuspenseQuery(enabledProviderModelsQueryOptions);
  const { data: agents } = useSuspenseQuery(agentsQueryOptions);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSubmit(value);
      }
    }
  }

  // Auto-resize textarea
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const canSubmit = value.trim().length > 0 && !disabled;

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border border-border/60 bg-card',
        'transition-all focus-within:border-border focus-within:shadow-md',
        'shadow-sm',
        embedded && 'rounded-none border-0 bg-transparent shadow-none',
        hasDockAbove && !embedded && 'rounded-t-none border-t-0 shadow-none',
        disabled && 'opacity-60',
      )}
    >
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={cn(
          'w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm leading-relaxed outline-none',
          'placeholder:text-muted-foreground/60',
          'max-h-48 overflow-y-auto',
          'field-sizing-content',
          disabled && 'cursor-not-allowed',
        )}
      />

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        {/* Left: model selector */}
        <div className="flex items-center gap-1">
          {agents.filter((a) => a.type === 'primary').length > 1 && (
            <AgentSelectorPopover
              selectedValue={selectedAgent as PrefixedString<'agt'> | null}
              onSelect={onAgentChange}
              agents={agents.filter((a) => a.type === 'primary')}
            />
          )}
          {providerModels.length > 0 && (
            <ModelSelectorPopover
              selectedValue={selectedModel}
              onSelect={onModelChange}
              providerModels={providerModels}
            />
          )}
        </div>

        {/* Right: stop or submit */}
        {isStreaming ? (
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            onClick={onStop}
            className="shrink-0"
          >
            <SquareIcon className="size-3.5" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon-xs"
            variant={canSubmit ? 'default' : 'outline'}
            disabled={!canSubmit}
            onClick={() => {
              if (canSubmit) onSubmit(value);
            }}
            className={cn('shrink-0 transition-all', canSubmit && 'shadow-sm')}
          >
            <ArrowUpIcon className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  selectedModel: string | null;
  onModelChange: (value: string) => void;
  selectedAgent: string | null;
  onAgentChange: (value: PrefixedString<'agt'> | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  hasDockAbove?: boolean;
  embedded?: boolean;
};

export function ChatInput({ className, hasDockAbove, embedded, ...props }: ChatInputProps) {
  return (
    <div className={cn('w-full', className)}>
      <React.Suspense
        fallback={
          <div
            className={cn(
              'relative flex flex-col rounded-2xl border border-border/60 bg-card shadow-sm',
              embedded && 'rounded-none border-0 bg-transparent shadow-none',
              hasDockAbove && !embedded && 'rounded-t-none border-t-0',
            )}
          >
            <div className="px-4 pt-4 pb-2">
              <div className="h-5 w-32 rounded bg-muted animate-pulse" />
            </div>
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <div className="h-6 w-24 rounded bg-muted animate-pulse" />
              <div className="size-6 rounded bg-muted animate-pulse" />
            </div>
          </div>
        }
      >
        <ChatInputInner hasDockAbove={hasDockAbove} embedded={embedded} {...props} />
      </React.Suspense>
    </div>
  );
}
