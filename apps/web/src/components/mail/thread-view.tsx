import { ArrowLeftIcon, CheckIcon, ReplyIcon, TagIcon, TrashIcon, Undo2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useQuery } from '@tanstack/react-query';

import type { MailAccountId, MailLabelView, MailMessageView, MailThreadId } from '@stitch/shared/mail/types';

import { Composer } from '@/components/mail/composer';
import { getLabelDisplayName } from '@/components/mail/mail-label-utils';
import { MessageBody } from '@/components/mail/message-body';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getServerUrl } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useModifyMailMessage, useTrashMailThread, useUntrashMailThread } from '@/lib/mutations/mail';
import { mailLabelsQueryOptions, mailThreadQueryOptions } from '@/lib/queries/mail';

type ThreadViewProps = { accountId: MailAccountId; threadId: MailThreadId; onClose: () => void };

function formatAddress(message: MailMessageView): string {
  if (!message.from) return 'Unknown sender';
  return message.from.name ? `${message.from.name} <${message.from.email}>` : message.from.email;
}

function LabelCombobox({
  labels,
  selectedLabels,
  onChange,
}: {
  labels: MailLabelView[];
  selectedLabels: MailLabelView[];
  onChange: (labelId: MailLabelView['id'], checked: boolean) => void;
}) {
  const selectedLabelIds = new Set(selectedLabels.map((label) => label.id));

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <TagIcon className="size-3.5" />
        {selectedLabels.length > 0 ? `${selectedLabels.length} labels` : 'Labels'}
      </PopoverTrigger>
      <PopoverContent side="bottom" sideOffset={4} align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search labels..." />
          <CommandList className="thin-scrollbar max-h-72">
            <CommandEmpty>No labels found.</CommandEmpty>
            <CommandGroup>
              {labels.map((label) => {
                const checked = selectedLabelIds.has(label.id);

                return (
                  <CommandItem
                    key={label.id}
                    value={getLabelDisplayName(label)}
                    onSelect={() => onChange(label.id, !checked)}>
                    <CheckIcon className={checked ? 'size-4 opacity-100' : 'size-4 opacity-0'} />
                    <span className="truncate">{getLabelDisplayName(label)}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MessageCard({
  message,
  collapsed,
  collapseQuotedReplies,
  fillAvailableHeight,
}: {
  message: MailMessageView;
  collapsed: boolean;
  collapseQuotedReplies: boolean;
  fillAvailableHeight: boolean;
}) {
  const [open, setOpen] = React.useState(!collapsed);

  function openAttachment(attachmentId: string) {
    void getServerUrl().then((baseUrl) =>
      window.open(`${baseUrl}/mail/attachments/${attachmentId}`, '_blank', 'noopener,noreferrer'),
    );
  }

  return (
    <div
      className={
        fillAvailableHeight
          ? 'flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card p-4 text-card-foreground'
          : 'rounded-lg border border-border bg-card p-4 text-card-foreground'
      }>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => setOpen(!open)}>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{formatAddress(message)}</div>
          <div className="text-xs text-muted-foreground">
            To: {message.to.map((address) => address.email).join(', ') || 'Undisclosed'}
          </div>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">{formatDateTime(message.internalDate)}</div>
      </button>
      {open ? (
        <div className={fillAvailableHeight ? 'mt-4 flex min-h-0 flex-1 flex-col space-y-3' : 'mt-4 space-y-3'}>
          <MessageBody
            bodyHtml={message.bodyHtml}
            bodyText={message.bodyText}
            collapseQuotedReplies={collapseQuotedReplies}
            fillAvailableHeight={fillAvailableHeight}
          />
          {message.attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <button
                  type="button"
                  key={attachment.id}
                  onClick={() => openAttachment(attachment.id)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                  {attachment.filename}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ThreadView({ accountId, threadId, onClose }: ThreadViewProps) {
  const { data: thread, isLoading } = useQuery(mailThreadQueryOptions(threadId));
  const { data: labels = [] } = useQuery(mailLabelsQueryOptions(accountId));
  const modifyMutation = useModifyMailMessage();
  const trashMutation = useTrashMailThread();
  const untrashMutation = useUntrashMailThread();
  const [replyTo, setReplyTo] = React.useState<MailMessageView | null>(null);
  const markedThreadRef = React.useRef<MailThreadId | null>(null);

  React.useEffect(() => {
    if (!thread || markedThreadRef.current === thread.id) return;
    markedThreadRef.current = thread.id;
    thread.messages
      .filter((message) => message.isUnread)
      .forEach((message) => {
        modifyMutation.mutate({ id: message.id, accountId, threadId: thread.id, markRead: true });
      });
  }, [accountId, modifyMutation, thread]);

  if (isLoading || !thread) return <div className="p-6 text-sm text-muted-foreground">Loading thread…</div>;

  const currentThread = thread;
  const latestMessage = currentThread.messages.at(-1) ?? null;

  function handleTrash() {
    const mutation = currentThread.isTrashed ? untrashMutation : trashMutation;
    void mutation
      .mutateAsync({ accountId, threadId: currentThread.id })
      .then(() => {
        toast.success(currentThread.isTrashed ? 'Thread restored' : 'Thread moved to trash', {
          id: 'mail-thread-trash',
        });
        if (!currentThread.isTrashed) onClose();
      })
      .catch((error: unknown) =>
        toast.error(getErrorMessage(error, 'Failed to update thread'), { id: 'mail-thread-trash' }),
      );
  }

  function handleLabel(labelId: (typeof labels)[number]['id'], checked: boolean) {
    if (!latestMessage) return;
    modifyMutation.mutate({
      id: latestMessage.id,
      accountId,
      threadId: currentThread.id,
      addLabelIds: checked ? [labelId] : undefined,
      removeLabelIds: checked ? undefined : [labelId],
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-12 items-center gap-2 border-b border-border px-4">
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Back to thread list">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{currentThread.subject || '(No subject)'}</div>
        <LabelCombobox labels={labels} selectedLabels={latestMessage?.labels ?? []} onChange={handleLabel} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => latestMessage && setReplyTo(latestMessage)}
          disabled={!latestMessage}>
          <ReplyIcon className="size-3.5" />
          Reply
        </Button>
        <Button variant={currentThread.isTrashed ? 'outline' : 'destructive'} size="sm" onClick={handleTrash}>
          {currentThread.isTrashed ? <Undo2Icon className="size-3.5" /> : <TrashIcon className="size-3.5" />}
          {currentThread.isTrashed ? 'Restore' : 'Trash'}
        </Button>
      </div>
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex min-h-full w-full flex-col space-y-4">
          {currentThread.messages.map((message, index) => {
            const isLatestMessage = index === currentThread.messages.length - 1;
            const collapseQuotedReplies = index > 0 || Boolean(message.inReplyTo);

            return (
              <MessageCard
                key={message.id}
                message={message}
                collapsed={!isLatestMessage}
                collapseQuotedReplies={collapseQuotedReplies}
                fillAvailableHeight={isLatestMessage && !collapseQuotedReplies}
              />
            );
          })}
        </div>
      </div>
      {replyTo ? <Composer accountId={accountId} replyTo={replyTo} onClose={() => setReplyTo(null)} /> : null}
    </div>
  );
}
