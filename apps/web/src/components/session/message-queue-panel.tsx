import { ArrowUpIcon, PaperclipIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

import type { QueuedMessage } from '@stitch/shared/chat/queue';
import type { PrefixedString } from '@stitch/shared/id';

import { Button } from '@/components/ui/button';
import type {
  EditQueuedMessagePayload,
  SendQueuedMessageFn,
} from '@/components/session/session-page-types';
import { useSessionStreamState } from '@/hooks/use-session-stream-state';
import { queuedMessagesQueryOptions, useRemoveFromQueue } from '@/lib/queries/queue';
import { cn } from '@/lib/utils';

type MessageQueuePanelProps = {
  className?: string;
  onEdit: (payload: EditQueuedMessagePayload) => void;
  sendQueuedRef: React.RefObject<SendQueuedMessageFn | null>;
};

export function MessageQueuePanel({ className, onEdit, sendQueuedRef }: MessageQueuePanelProps) {
  const { id } = useParams({ from: '/session/$id' });
  const { data: queuedMessages } = useQuery(queuedMessagesQueryOptions(id));

  const items = queuedMessages ?? [];

  return (
    <aside className={cn('h-full min-h-0 overflow-hidden bg-muted/45', className)}>
      <div className="h-full border-l border-foreground/25 bg-muted/45">
        <div className="border-b border-border/80 px-5 py-3.5">
          <p className="text-base font-medium">Queue</p>
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? 'Messages you queue while streaming appear here.'
              : `${items.length} queued message${items.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="h-[calc(100%-74px)] overflow-y-auto px-3 pt-3 pb-6">
          {items.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-center text-sm text-muted-foreground/70">
                Queue is empty. Messages you send while the assistant is responding will appear
                here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <QueuedMessageCard
                  key={item.id}
                  item={item}
                  sessionId={id}
                  onEdit={onEdit}
                  sendQueuedRef={sendQueuedRef}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

type QueuedMessageCardProps = {
  item: QueuedMessage;
  sessionId: string;
  onEdit: (payload: EditQueuedMessagePayload) => void;
  sendQueuedRef: React.RefObject<SendQueuedMessageFn | null>;
};

function QueuedMessageCard({ item, sessionId, onEdit, sendQueuedRef }: QueuedMessageCardProps) {
  const streamState = useSessionStreamState(sessionId);
  const removeFromQueue = useRemoveFromQueue();

  const isStreaming = streamState.isStreaming;
  const hasAttachments = item.attachments.length > 0;

  function handleDelete() {
    removeFromQueue.mutate({
      sessionId: sessionId as PrefixedString<'ses'>,
      queueId: item.id,
    });
  }

  function handleEdit() {
    removeFromQueue.mutate({
      sessionId: sessionId as PrefixedString<'ses'>,
      queueId: item.id,
    });
    onEdit({
      content: item.content,
      attachments: item.attachments,
    });
  }

  function handleSend() {
    const sendFn = sendQueuedRef.current;
    if (!sendFn) return;

    sendFn(item.content, item.attachments);
    removeFromQueue.mutate({
      sessionId: sessionId as PrefixedString<'ses'>,
      queueId: item.id,
    });
  }

  return (
    <div className="group rounded-lg border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm text-foreground">{item.content || '(no text)'}</p>
          {hasAttachments ? (
            <div className="mt-1 flex items-center gap-1 text-muted-foreground">
              <PaperclipIcon className="size-3" />
              <span className="text-xs">
                {item.attachments.length} file{item.attachments.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1 border-t border-border/40 pt-2">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleDelete}
          aria-label="Delete from queue"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2Icon className="size-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleEdit}
          aria-label="Edit message"
          className="text-muted-foreground hover:text-foreground"
        >
          <PencilIcon className="size-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          disabled={isStreaming}
          onClick={handleSend}
          aria-label={isStreaming ? 'Cannot send while streaming' : 'Send message'}
          className="ml-auto text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <ArrowUpIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
