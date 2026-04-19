import { ArrowUpIcon, ListOrderedIcon, PaperclipIcon, SquareIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';

import type { Mention, MentionSuggestion } from '@stitch/shared/chat/mentions';

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
import { mentionSuggestionsQueryOptions } from '@/lib/queries/mentions';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';
import { cn } from '@/lib/utils';

type ChatInputInnerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string, attachments: Attachment[], mentions: Mention[]) => void;
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

/** Returns the @-query token being typed, or null if not in a mention. */
function getActiveMentionQuery(
  text: string,
  cursorPos: number,
): { query: string; startIndex: number } | null {
  const textBeforeCursor = text.slice(0, cursorPos);
  const atIndex = textBeforeCursor.lastIndexOf('@');
  if (atIndex === -1) return null;

  // Ensure there's no whitespace between @ and cursor
  const tokenAfterAt = textBeforeCursor.slice(atIndex + 1);
  if (/\s/.test(tokenAfterAt)) return null;

  return { query: tokenAfterAt, startIndex: atIndex };
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
  mode = 'send',
  pendingAttachments,
  onPendingAttachmentsConsumed,
}: ChatInputInnerProps) {
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const [mentions, setMentions] = React.useState<Mention[]>([]);
  const [mentionQuery, setMentionQuery] = React.useState<{
    query: string;
    startIndex: number;
  } | null>(null);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  const suggestionsQuery = useQuery({
    ...mentionSuggestionsQueryOptions(mentionQuery?.query ?? ''),
    enabled: mentionQuery !== null,
  });
  const suggestions = suggestionsQuery.data ?? [];
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

  const closeMentionDropdown = React.useCallback(() => {
    setMentionQuery(null);
    setHighlightedIndex(0);
  }, []);

  const selectSuggestion = React.useCallback(
    (suggestion: MentionSuggestion) => {
      if (!mentionQuery) return;

      // Avoid duplicate mentions by ID
      setMentions((prev) => {
        if (prev.some((m) => m.id === suggestion.id)) return prev;
        return [...prev, { type: suggestion.type, id: suggestion.id, label: suggestion.label }];
      });

      // Replace the @<query> token in text with @Label and a trailing space
      const before = value.slice(0, mentionQuery.startIndex);
      const after = value.slice(mentionQuery.startIndex + 1 + mentionQuery.query.length);
      const replacement = `@${suggestion.label} `;
      const newValue = `${before}${replacement}${after}`;
      onChange(newValue);

      closeMentionDropdown();

      // Restore focus and move cursor after the inserted token
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const pos = before.length + replacement.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [value, mentionQuery, onChange, closeMentionDropdown],
  );

  const removeMention = React.useCallback((id: string) => {
    setMentions((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const submit = React.useCallback(() => {
    onSubmit(value, consumeForSubmit(), mentions);
    setMentions([]);
  }, [consumeForSubmit, onSubmit, value, mentions]);

  function handleTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = event.target.value;
    onChange(newValue);

    const cursor = event.target.selectionStart ?? newValue.length;
    const active = getActiveMentionQuery(newValue, cursor);
    if (active) {
      setMentionQuery(active);
      setHighlightedIndex(0);
    } else {
      closeMentionDropdown();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery && suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightedIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const item = suggestions[highlightedIndex];
        if (item) selectSuggestion(item);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMentionDropdown();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if ((value.trim() || attachments.length > 0) && !disabled) {
        submit();
      }
    }
  }

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        closeMentionDropdown();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeMentionDropdown]);

  React.useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  const canSubmit = (value.trim().length > 0 || attachments.length > 0) && !disabled;

  // Group suggestions by category
  const groupedSuggestions = React.useMemo(() => {
    const data = suggestionsQuery.data ?? [];
    const groups = new Map<string, MentionSuggestion[]>();
    for (const s of data) {
      const list = groups.get(s.category) ?? [];
      list.push(s);
      groups.set(s.category, list);
    }
    return [...groups.entries()];
  }, [suggestionsQuery.data]);

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

      {/* Mention autocomplete dropdown */}
      {mentionQuery !== null && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="thin-scrollbar absolute right-0 bottom-full left-0 z-50 mb-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg"
        >
          {groupedSuggestions.map(([category, items]) => (
            <div key={category}>
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {category}
              </div>
              {items.map((item) => {
                const flatIndex = suggestions.indexOf(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors',
                      flatIndex === highlightedIndex
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50',
                    )}
                    onMouseEnter={() => setHighlightedIndex(flatIndex)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectSuggestion(item);
                    }}
                  >
                    <span className="text-sm leading-tight font-medium">@{item.label}</span>
                    <span className="line-clamp-1 text-xs leading-tight text-muted-foreground">
                      {item.description}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
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

      {/* Mention chips */}
      {mentions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {mentions.map((mention) => (
            <span
              key={mention.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/20"
            >
              @{mention.label}
              <button
                type="button"
                onClick={() => removeMention(mention.id)}
                className="flex items-center rounded-full text-primary/60 transition-colors hover:text-primary"
                aria-label={`Remove @${mention.label}`}
              >
                <XIcon className="size-3" />
              </button>
            </span>
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
        onChange={handleTextChange}
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
