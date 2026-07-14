import { ArrowUpIcon, ChevronDownIcon, MicIcon, PaperclipIcon, SquareIcon } from 'lucide-react';
import * as React from 'react';

import { parseHotkey, useHeldKeys, useHotkey } from '@tanstack/react-hotkeys';
import { useSuspenseQuery } from '@tanstack/react-query';

import { AttachmentPreview } from './attachment-preview';
import { ModelSelectorPopover } from './model-selector-popover';
import { RecordingBar } from './recording-bar';
import { ATTACHMENT_ACCEPT, useAttachments } from './use-attachments';
import { useDictation } from './use-dictation';

import type { Attachment, ModelSpec } from './types';
import { buildProviderModelOptions, findProviderModelOption } from '@/components/model-selectors/provider-model-utils';
import type { SttModelSelection } from '@/components/model-selectors/stt-model-selector-popover';
import { SttModelSelectorPopover } from '@/components/model-selectors/stt-model-selector-popover';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group';
import { TextareaCompletions, type TextareaCompletionGroup } from '@/components/ui/textarea-completions';
import { supportsAnyAttachment } from '@/lib/model-capabilities';
import { sttProviderModelsQueryOptions, visibleProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { useShortcuts } from '@/lib/shortcuts';
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
  completionGroups?: TextareaCompletionGroup[];
};

const EMPTY_COMPLETION_GROUPS: TextareaCompletionGroup[] = [];

function areHotkeyKeysHeld(hotkey: string, heldKeys: string[]) {
  const parsed = parseHotkey(hotkey);
  const held = new Set(heldKeys.map((key) => key.toLowerCase()));

  return held.has(parsed.key.toLowerCase()) && parsed.modifiers.every((modifier) => held.has(modifier.toLowerCase()));
}

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
  completionGroups = EMPTY_COMPLETION_GROUPS,
}: ChatInputInnerProps) {
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: sttProviders } = useSuspenseQuery(sttProviderModelsQueryOptions);
  const shortcuts = useShortcuts();
  const heldKeys = useHeldKeys();
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
  } = useAttachments({ pendingAttachments, onPendingAttachmentsConsumed });

  const allOptions = React.useMemo(() => buildProviderModelOptions(providerModels), [providerModels]);
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
      if ((value.trim() || attachments.length > 0) && !disabled && !dictation.isRecording) {
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

  // Dictation
  const dictation = useDictation({
    value,
    onChange,
    sttProviders,
    defaultProviderId: settings['stt.default.providerId'],
    defaultModelId: settings['stt.default.modelId'],
  });
  const { isRecording, isStopping, start, stopAndCommit, toggle } = dictation;

  const defaultSttModel: SttModelSelection | null =
    settings['stt.default.providerId'] && settings['stt.default.modelId']
      ? { providerId: settings['stt.default.providerId'], modelId: settings['stt.default.modelId'] }
      : null;

  const dictationHotkey = shortcuts.get('toggle-dictation');
  const dictationHotkeyValue = dictationHotkey?.hotkey ?? 'Mod+Space';
  const holdToTalk = settings['stt.holdToTalk'] === 'true';
  const dictationEnabled = sttProviders.length > 0 && !!dictationHotkey?.hotkey && !disabled;
  const isDictationHotkeyHeld = areHotkeyKeysHeld(dictationHotkeyValue, heldKeys);

  useHotkey(dictationHotkeyValue, () => (holdToTalk ? start() : toggle()), {
    preventDefault: true,
    requireReset: true,
    enabled: dictationEnabled,
  });

  React.useEffect(() => {
    if (!holdToTalk || !isRecording || isDictationHotkeyHeld) return;

    void stopAndCommit();
  }, [holdToTalk, isDictationHotkeyHeld, isRecording, stopAndCommit]);

  const canSend = canSubmit && !isRecording && !isStopping;

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
      }}>
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/5">
          <p className="text-sm font-medium text-primary">Drop files here</p>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {attachments.map((attachment) => (
            <AttachmentPreview key={attachment.id} attachment={attachment} onRemove={removeAttachment} />
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

      <TextareaCompletions
        textareaRef={textareaRef}
        value={value}
        onChange={onChange}
        groups={completionGroups}
        disabled={disabled}
        onKeyDown={handleKeyDown}>
        {({ textareaProps }) => (
          <textarea
            ref={textareaRef}
            value={value}
            {...textareaProps}
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
        )}
      </TextareaCompletions>

      <div className="flex items-center justify-between px-3 pt-1 pb-3">
        {isRecording || isStopping ? (
          <RecordingBar
            audioLevel={dictation.audioLevel}
            startedAt={dictation.startedAt}
            isStopping={isStopping}
            onCancel={dictation.cancel}
            onStop={() => {
              void dictation.stopAndCommit();
            }}
          />
        ) : (
          <div className="flex items-center gap-1">
            {providerModels.length > 0 && (
              <ModelSelectorPopover
                selectedValue={selectedModel}
                onSelect={onModelChange}
                providerModels={providerModels}
              />
            )}

            {canAttach && (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="text-muted-foreground hover:text-foreground"
                title="Attach files">
                <PaperclipIcon className="size-3.5" />
              </Button>
            )}

            {sttProviders.length > 0 ? (
              <ButtonGroup>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => dictation.toggle()}
                  disabled={disabled}
                  className={cn(
                    'text-muted-foreground hover:text-foreground',
                    disabled && 'pointer-events-none opacity-50',
                  )}
                  title="Speak to type">
                  <MicIcon className="size-3.5" />
                </Button>
                <ButtonGroupSeparator />
                <SttModelSelectorPopover
                  defaultValue={defaultSttModel}
                  onSelect={(model) => dictation.start(model)}
                  sttProviders={sttProviders}
                  triggerRender={
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="w-4 px-0 text-muted-foreground hover:text-foreground">
                      <ChevronDownIcon className="size-3" />
                    </Button>
                  }
                />
              </ButtonGroup>
            ) : null}
          </div>
        )}

        <div className="flex items-center gap-1">
          {isStreaming ? (
            <Button type="button" size="icon-xs" variant="destructive" onClick={onStop} className="shrink-0">
              <SquareIcon className="size-3.5" />
            </Button>
          ) : null}

          {!isStreaming ? (
            <Button
              type="button"
              size="icon-xs"
              variant={canSend ? 'default' : 'outline'}
              disabled={!canSend}
              onClick={() => {
                if (canSend) submit();
              }}
              className={cn('shrink-0 transition-all', canSend && 'shadow-sm')}
              title="Send message">
              <ArrowUpIcon className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
