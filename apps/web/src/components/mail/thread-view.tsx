import { ArrowLeftIcon, ReplyIcon, TagIcon, TrashIcon, Undo2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useQuery } from '@tanstack/react-query';

import type { MailAccountId, MailMessageView, MailThreadId } from '@stitch/shared/mail/types';

import { Composer } from '@/components/mail/composer';
import { getLabelDisplayName } from '@/components/mail/mail-label-utils';
import { MessageBody } from '@/components/mail/message-body';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getServerUrl } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { useModifyMailMessage, useTrashMailThread, useUntrashMailThread } from '@/lib/mutations/mail';
import { mailLabelsQueryOptions, mailThreadQueryOptions } from '@/lib/queries/mail';

type ThreadViewProps = { accountId: MailAccountId; threadId: MailThreadId; onClose: () => void };

function formatAddress(message: MailMessageView): string {
  if (!message.from) return 'Unknown sender';
  return message.from.name ? `${message.from.name} <${message.from.email}>` : message.from.email;
}

function formatMessageDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function MessageCard({ message, collapsed }: { message: MailMessageView; collapsed: boolean }) {
  const [open, setOpen] = React.useState(!collapsed);

  function openAttachment(attachmentId: string) {
    void getServerUrl().then((baseUrl) =>
      window.open(`${baseUrl}/mail/attachments/${attachmentId}`, '_blank', 'noopener,noreferrer'),
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
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
        <div className="shrink-0 text-xs text-muted-foreground">{formatMessageDate(message.internalDate)}</div>
      </button>
      {open ? (
        <div className="mt-4 space-y-3">
          <MessageBody bodyHtml={message.bodyHtml} bodyText={message.bodyText} />
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
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <TagIcon className="size-3.5" />
            Labels
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            {labels.map((label) => (
              <DropdownMenuCheckboxItem
                key={label.id}
                checked={latestMessage?.labels.some((messageLabel) => messageLabel.id === label.id) ?? false}
                onCheckedChange={(checked) => handleLabel(label.id, checked)}>
                {label.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex flex-wrap gap-2">
            {currentThread.labels.map((label) => (
              <Badge key={label.id} variant="secondary">
                {getLabelDisplayName(label)}
              </Badge>
            ))}
          </div>
          {currentThread.messages.map((message, index) => (
            <MessageCard key={message.id} message={message} collapsed={index < currentThread.messages.length - 1} />
          ))}
        </div>
      </div>
      {replyTo ? <Composer accountId={accountId} replyTo={replyTo} onClose={() => setReplyTo(null)} /> : null}
    </div>
  );
}
