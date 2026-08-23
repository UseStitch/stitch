import { ArrowLeftIcon, CheckIcon, ReplyIcon, TagIcon, TrashIcon, Undo2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useQuery } from '@tanstack/react-query';

import type { MailAccountId, MailLabelView, MailMessageView, MailThreadId } from '@stitch/shared/mail/types';

import { Composer } from '@/components/mail/composer';
import { getLabelDisplayName } from '@/components/mail/mail-label-utils';
import { MessageBody } from '@/components/mail/message-body';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getServerUrl } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import {
  useModifyMailMessage,
  useTrashMailThread,
  useUntrashMailThread,
  mailLabelsQueryOptions,
  mailThreadQueryOptions,
} from '@/lib/queries/mail';

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
        <Icon as={TagIcon} size="s" />
        {selectedLabels.length > 0 ? `${selectedLabels.length} labels` : 'Labels'}
      </PopoverTrigger>
      <PopoverContent side="bottom" sideOffset={4} align="end" className="w-72 p-space-none">
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
                    <span className={checked ? 'opacity-100' : 'opacity-0'}>
                      <Icon as={CheckIcon} size="m" />
                    </span>
                    <Text as="span" variant="body" truncate>
                      {getLabelDisplayName(label)}
                    </Text>
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
          ? 'flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card p-space-xl text-card-foreground'
          : 'rounded-lg border border-border bg-card p-space-xl text-card-foreground'
      }>
      <Button
        type="button"
        variant="ghost"
        size="inline"
        width="full"
        align="between"
        className="items-start gap-space-l"
        onClick={() => setOpen(!open)}>
        <div className="min-w-0">
          <Text as="div" variant="body-strong" truncate>
            {formatAddress(message)}
          </Text>
          <Text as="div" variant="caption" tone="muted">
            To: {message.to.map((address) => address.email).join(', ') || 'Undisclosed'}
          </Text>
        </div>
        <Text as="div" variant="caption" tone="muted">
          {formatDateTime(message.internalDate)}
        </Text>
      </Button>
      {open ? (
        <div
          className={
            fillAvailableHeight
              ? 'mt-space-xl flex min-h-0 flex-1 flex-col space-y-space-l'
              : 'mt-space-xl space-y-space-l'
          }>
          <MessageBody
            bodyHtml={message.bodyHtml}
            bodyText={message.bodyText}
            collapseQuotedReplies={collapseQuotedReplies}
            fillAvailableHeight={fillAvailableHeight}
          />
          {message.attachments.length > 0 ? (
            <Stack direction="row" wrap gap="m">
              {message.attachments.map((attachment) => (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  key={attachment.id}
                  onClick={() => openAttachment(attachment.id)}>
                  {attachment.filename}
                </Button>
              ))}
            </Stack>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ThreadView({ accountId, threadId, onClose }: ThreadViewProps) {
  const { data: thread, isLoading } = useQuery({ ...mailThreadQueryOptions(threadId), select: (data) => data });
  const { data: labels = [] } = useQuery({ ...mailLabelsQueryOptions(accountId), select: (data) => data });
  const modifyMutation = useModifyMailMessage();
  const trashMutation = useTrashMailThread();
  const untrashMutation = useUntrashMailThread();
  const [replyTo, setReplyTo] = React.useState<MailMessageView | null>(null);
  const markedThreadRef = React.useRef<MailThreadId | null>(null);

  React.useEffect(() => {
    if (!thread || markedThreadRef.current === thread.id) return;
    markedThreadRef.current = thread.id;
    for (const message of thread.messages) {
      if (message.isUnread) {
        modifyMutation.mutate({ id: message.id, accountId, threadId: thread.id, markRead: true });
      }
    }
  }, [accountId, modifyMutation, thread]);

  if (isLoading || !thread)
    return (
      <div className="p-space-2xl">
        <Text tone="muted">Loading thread…</Text>
      </div>
    );

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
      .catch((error: Error) =>
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
      <div className="flex min-h-12 items-center gap-space-m border-b border-border px-space-xl">
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Back to thread list">
          <Icon as={ArrowLeftIcon} size="m" />
        </Button>
        <Text as="div" variant="body-strong" truncate>
          {currentThread.subject || '(No subject)'}
        </Text>
        <LabelCombobox labels={labels} selectedLabels={latestMessage?.labels ?? []} onChange={handleLabel} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => latestMessage && setReplyTo(latestMessage)}
          disabled={!latestMessage}>
          <Icon as={ReplyIcon} size="s" />
          Reply
        </Button>
        <Button variant={currentThread.isTrashed ? 'outline' : 'destructive'} size="sm" onClick={handleTrash}>
          {currentThread.isTrashed ? <Icon as={Undo2Icon} size="s" /> : <Icon as={TrashIcon} size="s" />}
          {currentThread.isTrashed ? 'Restore' : 'Trash'}
        </Button>
      </div>
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-space-2xl">
        <div className="flex min-h-full w-full flex-col space-y-space-xl">
          {currentThread.messages.map((message, index) => {
            const isLatestMessage = index === currentThread.messages.length - 1;
            const collapseQuotedReplies = index > 0 || Boolean(message.inReplyTo);

            return (
              <MessageCard
                key={`${message.id}:${isLatestMessage}`}
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
