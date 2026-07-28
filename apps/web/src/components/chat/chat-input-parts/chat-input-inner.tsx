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
import { Icon } from '@/components/primitives/icon.js';
import { Stack } from '@/components/primitives/stack.js';
import { Text } from '@/components/primitives/text.js';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group';
import { Textarea } from '@/components/ui/textarea';
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

  const allOptions = buildProviderModelOptions(providerModels);
  const selectedModelOption = findProviderModelOption(allOptions, selectedModel);
  const canAttach = supportsAnyAttachment(selectedModelOption?.modelSummary ?? null);

  const submit = () => {
    onSubmit(value, consumeForSubmit());
  };

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
        'relative flex flex-col rounded-2xl border border-border-subtle bg-card',
        'transition-all focus-within:border-border focus-within:shadow-md',
        'shadow-sm',
        embedded && 'rounded-none border-0 bg-transparent shadow-none',
        hasDockAbove && !embedded && 'rounded-t-none border-t-0 shadow-none',
        disabled && 'opacity-60',
        isDragging && 'ring-2 ring-primary border-primary',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => {
        void handleDrop(event);
      }}>
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary-subtle">
          <Text as="p" variant="body-strong" tone="primary">
            Drop files here
          </Text>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-space-m px-space-xl pt-space-l">
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
          <Textarea
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
              'min-h-0 w-full resize-none rounded-none border-0 bg-transparent px-space-xl pt-space-xl pb-space-m text-sm leading-relaxed',
              'placeholder:text-text-faint',
              'max-h-48 overflow-y-auto thin-scrollbar',
              'field-sizing-content',
              'focus-visible:ring-0 disabled:bg-transparent',
            )}
          />
        )}
      </TextareaCompletions>

      <div className="flex items-center justify-between px-space-l pt-space-xs pb-space-l">
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
          <Stack direction="row" align="center" gap="xs">
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
                variant="quiet"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                title="Attach files">
                <Icon as={PaperclipIcon} size="s" />
              </Button>
            )}

            {sttProviders.length > 0 ? (
              <ButtonGroup>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="quiet"
                  onClick={() => dictation.toggle()}
                  disabled={disabled}
                  title="Speak to type">
                  <Icon as={MicIcon} size="s" />
                </Button>
                <ButtonGroupSeparator />
                <SttModelSelectorPopover
                  defaultValue={defaultSttModel}
                  onSelect={(model) => dictation.start(model)}
                  sttProviders={sttProviders}
                  triggerRender={
                    <Button type="button" size="icon-xs" variant="quiet">
                      <Icon as={ChevronDownIcon} size="xs" />
                    </Button>
                  }
                />
              </ButtonGroup>
            ) : null}
          </Stack>
        )}

        <Stack direction="row" align="center" gap="xs">
          {isStreaming ? (
            <Button type="button" size="icon-xs" variant="destructive" onClick={onStop} className="shrink-0">
              <Icon as={SquareIcon} size="s" />
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
              className="shrink-0"
              title="Send message">
              <Icon as={ArrowUpIcon} size="s" />
            </Button>
          ) : null}
        </Stack>
      </div>
    </div>
  );
}
