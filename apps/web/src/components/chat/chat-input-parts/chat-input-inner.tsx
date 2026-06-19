import { ArrowUpIcon, ChevronDownIcon, MicIcon, PaperclipIcon, SquareIcon } from 'lucide-react';
import * as React from 'react';

import { useHotkey } from '@tanstack/react-hotkeys';
import { useSuspenseQuery } from '@tanstack/react-query';

import { AttachmentPreview } from './attachment-preview';
import { ModelSelectorPopover } from './model-selector-popover';
import { RecordingBar } from './recording-bar';
import { ATTACHMENT_ACCEPT, useAttachments } from './use-attachments';
import { useDictation } from './use-dictation';

import type { Attachment, ModelSpec } from './types';
import {
  buildProviderModelOptions,
  findProviderModelOption,
} from '@/components/model-selectors/provider-model-utils';
import type { SttModelSelection } from '@/components/model-selectors/stt-model-selector-popover';
import { SttModelSelectorPopover } from '@/components/model-selectors/stt-model-selector-popover';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { supportsAnyAttachment } from '@/lib/model-capabilities';
import {
  sttProviderModelsQueryOptions,
  visibleProviderModelsQueryOptions,
} from '@/lib/queries/providers';
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
};

type CompletionPrefix = '/' | '@';

type CompletionState = {
  prefix: CompletionPrefix;
  anchorIndex: number;
  filter: string;
};

type CompletionOption = {
  value: string;
  label: string;
  description: string;
};

const SLASH_COMPLETIONS: CompletionOption[] = [
  { value: 'summarize', label: 'Summarize', description: 'Summarize the current context' },
  { value: 'rewrite', label: 'Rewrite', description: 'Rewrite selected text or your draft' },
  { value: 'plan', label: 'Plan', description: 'Create a step-by-step plan' },
  { value: 'debug', label: 'Debug', description: 'Help diagnose an issue' },
];

const MENTION_COMPLETIONS: CompletionOption[] = [
  { value: 'workspace', label: 'Workspace', description: 'Reference the current workspace' },
  { value: 'agenda', label: 'Agenda', description: 'Reference agenda items' },
  { value: 'notes', label: 'Notes', description: 'Reference notes and summaries' },
  { value: 'files', label: 'Files', description: 'Reference attached or local files' },
];

function getCompletionState(textarea: HTMLTextAreaElement): CompletionState | null {
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart !== selectionEnd || document.activeElement !== textarea) return null;

  const textBeforeCaret = value.slice(0, selectionStart);
  const slashIndex = textBeforeCaret.lastIndexOf('/');
  const mentionIndex = textBeforeCaret.lastIndexOf('@');
  const anchorIndex = Math.max(slashIndex, mentionIndex);
  if (anchorIndex < 0) return null;

  const prefix = value[anchorIndex] as CompletionPrefix;
  const previousCharacter = anchorIndex > 0 ? value[anchorIndex - 1] : '';
  if (previousCharacter && !/\s/.test(previousCharacter)) return null;

  const filter = value.slice(anchorIndex + 1, selectionStart);
  if (/\s/.test(filter)) return null;

  return { prefix, anchorIndex, filter };
}

function filterCompletionOptions(state: CompletionState | null): CompletionOption[] {
  if (!state) return [];

  const options = state.prefix === '/' ? SLASH_COMPLETIONS : MENTION_COMPLETIONS;
  const filter = state.filter.toLocaleLowerCase();
  if (!filter) return options;

  return options.filter((option) => {
    return (
      option.value.toLocaleLowerCase().startsWith(filter) ||
      option.label.toLocaleLowerCase().startsWith(filter)
    );
  });
}

function getTextareaCharacterRect(textarea: HTMLTextAreaElement, index: number): DOMRect {
  const computedStyle = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const textareaRect = textarea.getBoundingClientRect();
  const properties = [
    'boxSizing',
    'width',
    'height',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textTransform',
    'textIndent',
    'textAlign',
    'whiteSpace',
    'wordBreak',
    'overflowWrap',
    'tabSize',
  ] as const;

  mirror.style.position = 'fixed';
  mirror.style.top = `${textareaRect.top}px`;
  mirror.style.left = `${textareaRect.left}px`;
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';

  for (const property of properties) {
    mirror.style[property] = computedStyle[property];
  }

  const before = textarea.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = textarea.value[index] || ' ';
  mirror.textContent = before;
  mirror.append(marker);
  document.body.append(mirror);

  const markerRect = marker.getBoundingClientRect();
  mirror.remove();

  return new DOMRect(
    markerRect.left - textarea.scrollLeft,
    markerRect.top - textarea.scrollTop,
    1,
    markerRect.height || Number.parseFloat(computedStyle.lineHeight) || 16,
  );
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
}: ChatInputInnerProps) {
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: sttProviders } = useSuspenseQuery(sttProviderModelsQueryOptions);
  const shortcuts = useShortcuts();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const completionListId = React.useId();
  const [completionState, setCompletionState] = React.useState<CompletionState | null>(null);
  const [activeCompletionIndex, setActiveCompletionIndex] = React.useState(0);

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
  const completionOptions = filterCompletionOptions(completionState);
  const isCompletionOpen = completionState !== null && completionOptions.length > 0 && !disabled;

  const completionAnchor = React.useMemo(() => {
    return {
      getBoundingClientRect: () => {
        const textarea = textareaRef.current;
        if (!textarea || !completionState) return new DOMRect();

        return getTextareaCharacterRect(textarea, completionState.anchorIndex);
      },
    };
  }, [completionState]);

  const updateCompletionState = React.useCallback(() => {
    const textarea = textareaRef.current;
    const nextState = textarea ? getCompletionState(textarea) : null;
    setCompletionState(nextState);
    setActiveCompletionIndex(0);
  }, []);

  const submit = React.useCallback(() => {
    onSubmit(value, consumeForSubmit());
  }, [consumeForSubmit, onSubmit, value]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (isCompletionOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveCompletionIndex((index) => (index + 1) % completionOptions.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveCompletionIndex((index) =>
          index === 0 ? completionOptions.length - 1 : index - 1,
        );
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setCompletionState(null);
        return;
      }

      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault();
        applyCompletion(completionOptions[activeCompletionIndex]);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if ((value.trim() || attachments.length > 0) && !disabled && !dictation.isRecording) {
        submit();
      }
    }
  }

  function applyCompletion(option: CompletionOption) {
    const textarea = textareaRef.current;
    if (!textarea || !completionState) return;

    const replacement = `${completionState.prefix}${option.value} `;
    const prefix = value.slice(0, completionState.anchorIndex) + replacement;
    const suffix = value.slice(textarea.selectionEnd);
    const nextValue = prefix + suffix;

    onChange(nextValue);
    setCompletionState(null);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(prefix.length, prefix.length);
    });
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
  const { isRecording, isStopping } = dictation;

  const defaultSttModel: SttModelSelection | null =
    settings['stt.default.providerId'] && settings['stt.default.modelId']
      ? { providerId: settings['stt.default.providerId'], modelId: settings['stt.default.modelId'] }
      : null;

  const dictationHotkey = shortcuts.get('toggle-dictation');
  const holdToTalk = settings['stt.holdToTalk'] === 'true';
  const dictationEnabled = sttProviders.length > 0 && !!dictationHotkey?.hotkey && !disabled;

  // Toggle mode: press once to start, again to finalize.
  useHotkey(dictationHotkey?.hotkey ?? 'Mod+Space', () => dictation.toggle(), {
    preventDefault: true,
    enabled: dictationEnabled && !holdToTalk,
  });

  // Hold-to-talk mode: record while held, finalize on release.
  useHotkey(dictationHotkey?.hotkey ?? 'Mod+Space', () => dictation.start(), {
    preventDefault: true,
    requireReset: true,
    enabled: dictationEnabled && holdToTalk,
  });
  useHotkey(
    dictationHotkey?.hotkey ?? 'Mod+Space',
    () => {
      void dictation.stopAndCommit();
    },
    { eventType: 'keyup', enabled: dictationEnabled && holdToTalk },
  );

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
        aria-activedescendant={
          isCompletionOpen ? `${completionListId}-${activeCompletionIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={isCompletionOpen ? completionListId : undefined}
        aria-expanded={isCompletionOpen}
        onChange={(event) => {
          onChange(event.target.value);
          requestAnimationFrame(updateCompletionState);
        }}
        onKeyDown={handleKeyDown}
        onPaste={(event) => {
          void handlePaste(event);
        }}
        onSelect={updateCompletionState}
        onBlur={() => setCompletionState(null)}
        onFocus={updateCompletionState}
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

      <Popover open={isCompletionOpen} modal={false}>
        <PopoverContent
          anchor={completionAnchor}
          align="start"
          collisionPadding={8}
          finalFocus={false}
          initialFocus={false}
          side="bottom"
          sideOffset={6}
          className="w-72 gap-1 p-1"
        >
          <div
            id={completionListId}
            role="listbox"
            className="thin-scrollbar max-h-64 overflow-y-auto"
          >
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {completionState?.prefix === '/' ? 'Commands' : 'References'}
            </div>
            {completionOptions.map((option, index) => (
              <button
                id={`${completionListId}-${index}`}
                key={option.value}
                type="button"
                role="option"
                aria-selected={index === activeCompletionIndex}
                className={cn(
                  'flex w-full cursor-default flex-col rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors',
                  index === activeCompletionIndex && 'bg-muted text-foreground',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveCompletionIndex(index)}
                onClick={() => applyCompletion(option)}
              >
                <span className="font-medium">
                  {completionState?.prefix}
                  {option.value}
                </span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

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
                  onClick={() => dictation.toggle()}
                  disabled={disabled}
                  className={cn(
                    'text-muted-foreground hover:text-foreground',
                    disabled && 'pointer-events-none opacity-50',
                  )}
                  title="Speak to type"
                >
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
                      className="w-4 px-0 text-muted-foreground hover:text-foreground"
                    >
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
              variant={canSend ? 'default' : 'outline'}
              disabled={!canSend}
              onClick={() => {
                if (canSend) submit();
              }}
              className={cn('shrink-0 transition-all', canSend && 'shadow-sm')}
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
