import { ArrowUpIcon, ListOrderedIcon, PaperclipIcon, SquareIcon } from 'lucide-react';
import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import { AttachmentPreview } from './attachment-preview';
import { ModelSelectorPopover } from './model-selector-popover';
import { ATTACHMENT_ACCEPT, useAttachments } from './use-attachments';

import type { Attachment, ModelSpec } from './types';
import {
  buildProviderModelOptions,
  findProviderModelOption,
} from '@/components/model-selectors/provider-model-utils';
import { Button } from '@/components/ui/button';
import { supportsAnyAttachment } from '@/lib/model-capabilities';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';
import { cn } from '@/lib/utils';

type ChatInputInnerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string, attachments: Attachment[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  selectedModel: ModelSpec | null;
  onModelChange: (value: ModelSpec) => void;
  placeholder?: string;
  disabled?: boolean;
  hasDockAbove?: boolean;
  embedded?: boolean;
  mode?: 'send' | 'queue';
  pendingAttachments?: Attachment[];
  onPendingAttachmentsConsumed?: () => void;
};

export function ChatInputInner({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  selectedModel,
  onModelChange,
  placeholder = 'Ask anything...',
  disabled,
  hasDockAbove,
  embedded,
  mode = 'send',
  pendingAttachments,
  onPendingAttachmentsConsumed,
}: ChatInputInnerProps) {
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    attachments,
    isDragging,
    removeAttachment,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
    consumeForSubmit,
  } = useAttachments({
    pendingAttachments,
    onPendingAttachmentsConsumed,
  });

  const allOptions = React.useMemo(
    () => buildProviderModelOptions(providerModels),
    [providerModels],
  );
  const selectedModelOption = React.useMemo(
    () => findProviderModelOption(allOptions, selectedModel),
    [allOptions, selectedModel],
  );
  const canAttach = supportsAnyAttachment(selectedModelOption?.modelSummary ?? null);

  const submit = React.useCallback(() => {
    onSubmit(value, consumeForSubmit());
  }, [consumeForSubmit, onSubmit, value]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if ((value.trim() || attachments.length > 0) && !disabled) {
        submit();
      }
    }
  }

  React.useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  const canSubmit = (value.trim().length > 0 || attachments.length > 0) && !disabled;

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border border-border/60 bg-card',
        'transition-all focus-within:border-border focus-within:shadow-md',
        'shadow-sm',
        embedded && 'rounded-none border-0 bg-transparent shadow-none',
        hasDockAbove && !embedded && 'rounded-t-none border-t-0 shadow-none',
        disabled && 'opacity-60',
        isDragging && 'ring-2 ring-primary/50 border-primary/50',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => {
        void handleDrop(event);
      }}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/5">
          <p className="text-sm font-medium text-primary">Drop files here</p>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {attachments.map((attachment) => (
            <AttachmentPreview
              key={attachment.id}
              attachment={attachment}
              onRemove={removeAttachment}
            />
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(event) => {
          void handleFileInputChange(event);
        }}
      />

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={(event) => {
          void handlePaste(event);
        }}
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

      <div className="flex items-center justify-between px-3 pt-1 pb-3">
        <div className="flex items-center gap-1">
          {providerModels.length > 0 && (
            <ModelSelectorPopover
              selectedValue={selectedModel}
              onSelect={onModelChange}
              providerModels={providerModels}
            />
          )}

          {canAttach && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className={cn(
                'flex items-center justify-center rounded-md p-1 transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                disabled && 'pointer-events-none',
              )}
              title="Attach files"
            >
              <PaperclipIcon className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isStreaming ? (
            <Button
              type="button"
              size="icon-xs"
              variant="destructive"
              onClick={onStop}
              className="shrink-0"
            >
              <SquareIcon className="size-3.5" />
            </Button>
          ) : null}

          {!(isStreaming && mode === 'send') ? (
            <Button
              type="button"
              size="icon-xs"
              variant={canSubmit ? (mode === 'queue' ? 'secondary' : 'default') : 'outline'}
              disabled={!canSubmit}
              onClick={() => {
                if (canSubmit) submit();
              }}
              className={cn('shrink-0 transition-all', canSubmit && 'shadow-sm')}
              title={mode === 'queue' ? 'Add to queue' : 'Send message'}
            >
              {mode === 'queue' ? (
                <ListOrderedIcon className="size-3.5" />
              ) : (
                <ArrowUpIcon className="size-3.5" />
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
