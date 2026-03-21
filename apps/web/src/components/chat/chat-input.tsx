import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import {
  ArrowUpIcon,
  CheckIcon,
  CpuIcon,
  SearchIcon,
  ChevronDownIcon,
  SquareIcon,
  BotIcon,
  PaperclipIcon,
  XIcon,
  FileIcon,
  FileTextIcon,
  ListOrderedIcon,
} from 'lucide-react';
import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Agent } from '@stitch/shared/agents/types';
import type { PrefixedString } from '@stitch/shared/id';

import { Button } from '@/components/ui/button';
import { supportsAnyAttachment } from '@/lib/model-capabilities';
import { agentsQueryOptions } from '@/lib/queries/agents';
import {
  visibleProviderModelsQueryOptions,
  type ProviderModels,
  type ModelSummary,
} from '@/lib/queries/providers';
import { cn } from '@/lib/utils';

const SEPARATOR = ':::';

export type Attachment = {
  id: string;
  /** Absolute filesystem path - sent to server, never base64 encoded */
  path: string;
  /** Blob URL for local preview only, never sent over the wire */
  previewUrl: string | null;
  mime: string;
  filename: string;
};

// Electron exposes the full path on File objects in the renderer process
type ElectronFile = File & { path?: string };

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
  };
  return map[mime] ?? 'bin';
}

async function fileToAttachment(file: File): Promise<Attachment | null> {
  const ef = file as ElectronFile;

  if (ef.path && ef.path.length > 0) {
    // Electron: full path available directly
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      path: ef.path,
      previewUrl,
      mime: file.type || 'application/octet-stream',
      filename: file.name,
    };
  }

  // Clipboard paste: no path - write to temp file via IPC
  if (!window.api?.files?.writeTmp) return null;

  const arrayBuffer = await file.arrayBuffer();
  const ext = mimeToExt(file.type);
  const filePath = await window.api.files.writeTmp(arrayBuffer, ext);
  const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    path: filePath,
    previewUrl,
    mime: file.type,
    filename: file.name || `paste.${ext}`,
  };
}

type ModelOption = {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  value: string;
  modelSummary: ModelSummary;
};

function buildModelOptions(providerModels: ProviderModels[]): ModelOption[] {
  return providerModels.flatMap((provider) =>
    provider.models.map((model) => ({
      providerId: provider.providerId,
      providerName: provider.providerName,
      modelId: model.id,
      modelName: model.name,
      value: `${provider.providerId}${SEPARATOR}${model.id}`,
      modelSummary: model,
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

type AttachmentPreviewProps = {
  attachment: Attachment;
  onRemove: (id: string) => void;
};

function AttachmentPreview({ attachment, onRemove }: AttachmentPreviewProps) {
  const isImage = attachment.mime.startsWith('image/');
  const isPdf = attachment.mime === 'application/pdf';

  return (
    <div className="relative group shrink-0">
      {isImage && attachment.previewUrl ? (
        <div className="relative size-16 rounded-lg overflow-hidden border border-border/60 bg-muted">
          <img
            src={attachment.previewUrl}
            alt={attachment.filename}
            className="size-full object-cover"
          />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border/60 bg-muted max-w-40">
          {isPdf ? (
            <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground truncate">{attachment.filename}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className={cn(
          'absolute -top-1.5 -right-1.5 size-4 rounded-full',
          'bg-foreground text-background flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'focus-visible:opacity-100 focus-visible:outline-none',
        )}
      >
        <XIcon className="size-2.5" />
      </button>
    </div>
  );
}

const TEXT_FILE_ACCEPT = [
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.yaml',
  '.yml',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.html',
  '.css',
  '.scss',
  '.sh',
  '.toml',
  '.xml',
].join(',');

const ACCEPT_ALL = `image/*,.pdf,${TEXT_FILE_ACCEPT}`;

type ChatInputInnerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string, attachments: Attachment[]) => void;
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
  mode?: 'send' | 'queue';
  pendingAttachments?: Attachment[];
  onPendingAttachmentsConsumed?: () => void;
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
  mode = 'send',
  pendingAttachments,
  onPendingAttachmentsConsumed,
}: ChatInputInnerProps) {
  const { data: providerModels } = useSuspenseQuery(visibleProviderModelsQueryOptions);
  const { data: agents } = useSuspenseQuery(agentsQueryOptions);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (pendingAttachments && pendingAttachments.length > 0) {
      setAttachments(pendingAttachments);
      onPendingAttachmentsConsumed?.();
    }
  }, [pendingAttachments, onPendingAttachmentsConsumed]);

  const allOptions = React.useMemo(
    () =>
      providerModels.flatMap((p) =>
        p.models.map((m) => ({
          value: `${p.providerId}${SEPARATOR}${m.id}`,
          modelSummary: m,
        })),
      ),
    [providerModels],
  );

  const selectedModelSummary = selectedModel
    ? (allOptions.find((o) => o.value === selectedModel)?.modelSummary ?? null)
    : null;

  const canAttach = supportsAnyAttachment(selectedModelSummary);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((value.trim() || attachments.length > 0) && !disabled) {
        submit();
      }
    }
  }

  function submit() {
    onSubmit(value, attachments);
    setAttachments([]);
  }

  // Auto-resize textarea
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  async function addFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    const processed = await Promise.all(fileArray.map(fileToAttachment));
    const valid = processed.filter((a): a is Attachment => a !== null);
    setAttachments((prev) => [...prev, ...valid]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null);
    await addFiles(files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      await addFiles(e.dataTransfer.files);
    }
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      await addFiles(e.target.files);
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

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
      onDrop={(e) => {
        void handleDrop(e);
      }}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-primary/5 pointer-events-none">
          <p className="text-sm font-medium text-primary">Drop files here</p>
        </div>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {attachments.map((att) => (
            <AttachmentPreview key={att.id} attachment={att} onRemove={removeAttachment} />
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_ALL}
        className="hidden"
        onChange={(e) => {
          void handleFileInputChange(e);
        }}
      />

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={(e) => {
          void handlePaste(e);
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

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        {/* Left: selectors + attach */}
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

        {/* Right: stop and/or submit */}
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

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string, attachments: Attachment[]) => void;
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
  mode?: 'send' | 'queue';
  pendingAttachments?: Attachment[];
  onPendingAttachmentsConsumed?: () => void;
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
