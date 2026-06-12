import {
  ArrowUpIcon,
  ChevronDownIcon,
  MicIcon,
  MicOffIcon,
  PaperclipIcon,
  SquareIcon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import { AttachmentPreview } from './attachment-preview';
import { ModelSelectorPopover } from './model-selector-popover';
import { ATTACHMENT_ACCEPT, useAttachments } from './use-attachments';
import { useStt } from './use-stt';

import type { Attachment, ModelSpec } from './types';
import {
  buildProviderModelOptions,
  findProviderModelOption,
} from '@/components/model-selectors/provider-model-utils';
import type { SttModelSelection } from '@/components/model-selectors/stt-model-selector-popover';
import { SttModelSelectorPopover } from '@/components/model-selectors/stt-model-selector-popover';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group';
import { supportsAnyAttachment } from '@/lib/model-capabilities';
import {
  sttProviderModelsQueryOptions,
  visibleProviderModelsQueryOptions,
} from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';
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
  pendingAttachments,
  onPendingAttachmentsConsumed,
}: ChatInputInnerProps) {
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: sttProviders } = useSuspenseQuery(sttProviderModelsQueryOptions);
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

  // STT
  const stt = useStt();
  const sttBaseOffsetRef = React.useRef(0);
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const [sttModelOverride, setSttModelOverride] = React.useState<SttModelSelection | null>(null);

  async function handleMicClick() {
    if (stt.state === 'recording') {
      const transcript = await stt.stop();
      const base = valueRef.current.slice(0, sttBaseOffsetRef.current);
      const separator = base.trimEnd().length > 0 ? ' ' : '';
      onChange(base.trimEnd() + separator + transcript);
      return;
    }

    if (stt.state !== 'idle') return;

    const providerId = sttModelOverride?.providerId ?? settings['stt.default.providerId'];
    const modelId = sttModelOverride?.modelId ?? settings['stt.default.modelId'];
    if (!providerId || !modelId) {
      toast.error('No STT model configured. Set one in Settings → General → STT Model.');
      return;
    }

    const provider = sttProviders.find((p) => p.providerId === providerId);
    const model = provider?.models.find((m) => m.id === modelId);
    if (!model) {
      toast.error('Configured STT model not found. Check Settings → General → STT Model.');
      return;
    }

    sttBaseOffsetRef.current = value.length;
    await stt.start(providerId, modelId, model.sampleRateHz);
  }

  // Splice partial text into textarea value while recording
  React.useEffect(() => {
    if (stt.state !== 'recording') return;
    const base = value.slice(0, sttBaseOffsetRef.current);
    const separator = base.trimEnd().length > 0 ? ' ' : '';
    const next = base.trimEnd() + separator + stt.partialText;
    if (next !== value) onChange(next);
    // Only re-run when partialText changes — value intentionally omitted to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.partialText, stt.state]);

  const isRecording = stt.state === 'recording';
  const isStopping = stt.state === 'stopping';

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
          'max-h-48 overflow-y-auto thin-scrollbar',
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

          {sttProviders.length > 0 ? (
            <ButtonGroup>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => {
                  void handleMicClick();
                }}
                disabled={disabled || isStopping}
                className={cn(
                  isRecording
                    ? 'text-destructive hover:text-destructive/80 hover:bg-destructive/10 animate-pulse'
                    : 'text-muted-foreground hover:text-foreground',
                  (disabled || isStopping) && 'pointer-events-none opacity-50',
                )}
                title={isRecording ? 'Stop recording' : 'Speak to type'}
              >
                {isRecording ? (
                  <MicOffIcon className="size-3.5" />
                ) : (
                  <MicIcon className="size-3.5" />
                )}
              </Button>
              {!isRecording && (
                <>
                  <ButtonGroupSeparator />
                  <SttModelSelectorPopover
                    selectedValue={sttModelOverride}
                    onSelect={setSttModelOverride}
                    sttProviders={sttProviders}
                    triggerRender={
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="w-4 px-0 text-muted-foreground hover:text-foreground"
                      >
                        <ChevronDownIcon className="size-3" />
                      </Button>
                    }
                  />
                </>
              )}
            </ButtonGroup>
          ) : (
            <button
              type="button"
              onClick={() => {
                void handleMicClick();
              }}
              disabled={disabled || isStopping}
              className={cn(
                'flex items-center justify-center rounded-md p-1 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                isRecording
                  ? 'text-destructive hover:text-destructive/80 hover:bg-destructive/10 animate-pulse'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                (disabled || isStopping) && 'pointer-events-none opacity-50',
              )}
              title={isRecording ? 'Stop recording' : 'Speak to type'}
            >
              {isRecording ? <MicOffIcon className="size-3.5" /> : <MicIcon className="size-3.5" />}
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

          {!isStreaming ? (
            <Button
              type="button"
              size="icon-xs"
              variant={canSubmit ? 'default' : 'outline'}
              disabled={!canSubmit}
              onClick={() => {
                if (canSubmit) submit();
              }}
              className={cn('shrink-0 transition-all', canSubmit && 'shadow-sm')}
              title="Send message"
            >
              <ArrowUpIcon className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
