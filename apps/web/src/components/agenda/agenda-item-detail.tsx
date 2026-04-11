import {
  CalendarIcon,
  ClockIcon,
  MessageSquareIcon,
  SendIcon,
  Trash2Icon,
} from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

import { settingsQueryOptions } from '@/lib/queries/settings';
import {
  EVENT_TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  TYPE_LABELS,
} from '@/components/agenda/constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { AgendaItem, AgendaItemPriority, AgendaItemStatus, AgendaItemType } from '@stitch/shared/agenda/types';
import {
  AGENDA_ITEM_PRIORITIES,
  AGENDA_ITEM_STATUSES,
  AGENDA_ITEM_TYPES,
} from '@stitch/shared/agenda/types';
import {
  agendaItemDetailQueryOptions,
  useAddAgendaItemComment,
  useDeleteAgendaItem,
  useUpdateAgendaItem,
} from '@/lib/queries/agenda';

type Props = {
  item: AgendaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function useUserTimezone(): string {
  const { data: settings } = useQuery(settingsQueryOptions);
  return settings?.['profile.timezone'] || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatDateTimeInTz(ts: number, timeZone: string): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
}

function formatDateInTz(ts: number, timeZone: string): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  });
}

function tsToDateInputValue(ts: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(new Date(ts));
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${d}`;
}

function dateInputValueToTs(dateStr: string, timeZone: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    day: '2-digit',
    hour12: false,
  });
  const utcFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: '2-digit',
    day: '2-digit',
    hour12: false,
  });

  const probe = new Date(utcNoon);
  const tzParts = formatter.formatToParts(probe);
  const utcParts = utcFormatter.formatToParts(probe);

  const tzHour = Number(tzParts.find((p) => p.type === 'hour')?.value ?? 0);
  const utcHour = Number(utcParts.find((p) => p.type === 'hour')?.value ?? 0);
  const tzDay = Number(tzParts.find((p) => p.type === 'day')?.value ?? 0);
  const utcDay = Number(utcParts.find((p) => p.type === 'day')?.value ?? 0);

  let offsetHours = utcHour - tzHour;
  if (utcDay > tzDay) offsetHours += 24;
  else if (utcDay < tzDay) offsetHours -= 24;

  return Date.UTC(year, month - 1, day, 12 + offsetHours, 0, 0);
}

export function AgendaItemDetailSheet({ item, open, onOpenChange }: Props) {
  const timeZone = useUserTimezone();
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [status, setStatus] = React.useState<AgendaItemStatus>('open');
  const [priority, setPriority] = React.useState<AgendaItemPriority>('medium');
  const [type, setType] = React.useState<AgendaItemType>('todo');
  const [dueAt, setDueAt] = React.useState('');
  const [commentText, setCommentText] = React.useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  const { data: detailData } = useQuery({
    ...agendaItemDetailQueryOptions(item?.id ?? ''),
    enabled: !!item,
  });

  const events = detailData?.item?.events ?? [];

  React.useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description);
      setStatus(item.status);
      setPriority(item.priority);
      setType(item.type);
      setDueAt(item.dueAt ? tsToDateInputValue(item.dueAt, timeZone) : '');
    }
  }, [item, timeZone]);

  const updateMutation = useUpdateAgendaItem();
  const deleteMutation = useDeleteAgendaItem();
  const commentMutation = useAddAgendaItemComment();

  function handleSave() {
    if (!item) return;
    const dueAtMs = dueAt ? dateInputValueToTs(dueAt, timeZone) : null;
    const prevDueAtStr = item.dueAt ? tsToDateInputValue(item.dueAt, timeZone) : '';
    updateMutation.mutate(
      {
        id: item.id,
        updates: {
          title: title !== item.title ? title : undefined,
          description: description !== item.description ? description : undefined,
          status: status !== item.status ? status : undefined,
          priority: priority !== item.priority ? priority : undefined,
          type: type !== item.type ? type : undefined,
          dueAt: dueAt !== prevDueAtStr ? dueAtMs : undefined,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  function handleDelete() {
    if (!item) return;
    deleteMutation.mutate(item.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        onOpenChange(false);
      },
    });
  }

  function handleAddComment() {
    if (!item || !commentText.trim()) return;
    commentMutation.mutate(
      { itemId: item.id, content: commentText.trim() },
      { onSuccess: () => setCommentText('') },
    );
  }

  const isDirty =
    item &&
    (title !== item.title ||
      description !== item.description ||
      status !== item.status ||
      priority !== item.priority ||
      type !== item.type ||
      dueAt !== (item.dueAt ? tsToDateInputValue(item.dueAt, timeZone) : ''));

  if (!item) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Agenda Item</SheetTitle>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-5 px-4">
            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Item title..."
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-20 resize-none"
                placeholder="Details..."
              />
            </div>

            {/* Status + Priority row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as AgendaItemStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENDA_ITEM_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Priority</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as AgendaItemPriority)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENDA_ITEM_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Type + Due date row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as AgendaItemType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENDA_ITEM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
            </div>

            {/* Metadata */}
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">List</span>
                <span className="text-foreground">{item.listName ?? 'Unknown'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">{formatDateInTz(item.createdAt, timeZone)}</span>
              </div>
              {item.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="text-foreground">{formatDateInTz(item.completedAt, timeZone)}</span>
                </div>
              )}
            </div>

            {/* Timeline */}
            {events.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label>Timeline</Label>
                <div className="flex flex-col gap-1.5">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2 text-xs"
                    >
                      <div className="mt-0.5 shrink-0">
                        {event.type === 'comment' ? (
                          <MessageSquareIcon className="size-3 text-muted-foreground" />
                        ) : event.type === 'status_change' ? (
                          <ClockIcon className="size-3 text-muted-foreground" />
                        ) : (
                          <CalendarIcon className="size-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{EVENT_TYPE_LABELS[event.type]}</span>
                          {event.fromStatus && event.toStatus && (
                            <span className="text-muted-foreground">
                              <Badge variant={STATUS_VARIANTS[event.fromStatus]} className="text-[10px] px-1 py-0">
                                {STATUS_LABELS[event.fromStatus]}
                              </Badge>
                              {' → '}
                              <Badge variant={STATUS_VARIANTS[event.toStatus]} className="text-[10px] px-1 py-0">
                                {STATUS_LABELS[event.toStatus]}
                              </Badge>
                            </span>
                          )}
                        </div>
                        {event.content && event.type === 'comment' && (
                          <p className="mt-0.5 text-muted-foreground">{event.content}</p>
                        )}
                        <span className="text-muted-foreground/70">
                          {formatDateTimeInTz(event.createdAt, timeZone)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add comment */}
            <div className="flex flex-col gap-1.5">
              <Label>Add Comment</Label>
              <div className="flex gap-2">
                <Input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a note..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || commentMutation.isPending}
                >
                  <SendIcon className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          <SheetFooter className="flex flex-row items-center justify-between gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleteMutation.isPending}
            >
              <Trash2Icon className="size-3.5" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete item?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This agenda item and its history will be permanently removed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
