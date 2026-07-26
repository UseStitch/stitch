import { CalendarIcon, Trash2Icon, XIcon } from 'lucide-react';
import * as React from 'react';
import { z } from 'zod';

import { useForm } from '@tanstack/react-form';

import type { AgendaItem, AgendaItemPriority, AgendaItemStatus } from '@stitch/shared/agenda/types';
import { AGENDA_ITEM_PRIORITIES, AGENDA_ITEM_STATUSES } from '@stitch/shared/agenda/types';

import { PRIORITY_LABELS, STATUS_LABELS } from '@/components/agenda/constants';
import { formatDateInTz, useUserTimezone } from '@/components/agenda/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useDeleteAgendaItem, useUpdateAgendaItem } from '@/lib/queries/agenda';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 600;

const agendaItemDetailSchema = z.object({
  title: z.string(),
  description: z.string(),
  status: z.enum(AGENDA_ITEM_STATUSES),
  priority: z.enum(AGENDA_ITEM_PRIORITIES),
  dueDate: z.date().nullable(),
});

type AgendaItemDetailValues = z.infer<typeof agendaItemDetailSchema>;

type AgendaItemUpdates = {
  title?: string;
  description?: string;
  status?: AgendaItemStatus;
  priority?: AgendaItemPriority;
  dueAt?: number | null;
};

type PendingTextSave = { id: string; title: string; description: string };
type AgendaSaveRequest = { id: string; updates: AgendaItemUpdates; started: boolean; cancelled: boolean };

type Props = { item: AgendaItem | null; open: boolean; onOpenChange: (open: boolean) => void };

export function AgendaItemDetailSheet({ item, open, onOpenChange }: Props) {
  const timeZone = useUserTimezone();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);

  const updateMutation = useUpdateAgendaItem();
  const deleteMutation = useDeleteAgendaItem();
  const form = useForm({
    defaultValues: {
      title: item?.title ?? '',
      description: item?.description ?? '',
      status: item?.status ?? 'open',
      priority: item?.priority ?? 'medium',
      dueDate: item?.dueAt ? new Date(item.dueAt) : null,
    } satisfies AgendaItemDetailValues,
    validators: { onMount: agendaItemDetailSchema, onChange: agendaItemDetailSchema },
  });

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTextRef = React.useRef<PendingTextSave | null>(null);
  const pendingSavesRef = React.useRef<AgendaSaveRequest[]>([]);
  const saveQueueRef = React.useRef(Promise.resolve());

  function queueSave(id: string, updates: AgendaItemUpdates) {
    const queued = pendingSavesRef.current.find((request) => request.id === id && !request.started);
    if (queued) {
      queued.updates = { ...queued.updates, ...updates };
      return;
    }

    const request: AgendaSaveRequest = { id, updates, started: false, cancelled: false };
    pendingSavesRef.current.push(request);
    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        if (request.cancelled) return;
        request.started = true;
        await updateMutation.mutateAsync({ id: request.id, updates: request.updates });
      })
      .catch(() => undefined)
      .finally(() => {
        pendingSavesRef.current = pendingSavesRef.current.filter((pending) => pending !== request);
      });
  }

  function cancelPendingText() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    pendingTextRef.current = null;
  }

  function flushPendingText() {
    const pending = pendingTextRef.current;
    cancelPendingText();
    if (pending) {
      queueSave(pending.id, { title: pending.title, description: pending.description });
    }
  }

  function scheduleTextSave(pending: PendingTextSave) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pendingTextRef.current = pending;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      pendingTextRef.current = null;
      queueSave(pending.id, { title: pending.title, description: pending.description });
    }, DEBOUNCE_MS);
  }

  const resetForm = React.useEffectEvent(() => {
    if (!item) return;
    form.reset({
      title: item.title,
      description: item.description,
      status: item.status,
      priority: item.priority,
      dueDate: item.dueAt ? new Date(item.dueAt) : null,
    });
  });

  React.useEffect(() => {
    cancelPendingText();
    resetForm();
    return cancelPendingText;
  }, [item?.id]);

  function dateToMs(date: Date): number {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    return new Date(y, m, d, 12, 0, 0).getTime();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) flushPendingText();
    onOpenChange(nextOpen);
  }

  async function handleDelete() {
    if (!item) return;
    const id = item.id;
    cancelPendingText();
    for (const request of pendingSavesRef.current) {
      if (request.id === id && !request.started) request.cancelled = true;
    }
    await saveQueueRef.current;
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        onOpenChange(false);
      },
    });
  }

  if (!item) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Agenda Item</SheetTitle>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-5 px-4">
            {/* List + Created info */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{item.listName ?? 'Unknown'}</span>
              <span>·</span>
              <span>Created {formatDateInTz(item.createdAt, timeZone)}</span>
              {item.completedAt && (
                <>
                  <span>·</span>
                  <span>Completed {formatDateInTz(item.completedAt, timeZone)}</span>
                </>
              )}
            </div>

            {/* Title */}
            <form.Field name="title">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label>Title</Label>
                  <Input
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      const title = event.target.value;
                      field.handleChange(title);
                      scheduleTextSave({ id: item.id, title, description: form.state.values.description });
                    }}
                    placeholder="Item title..."
                  />
                </div>
              )}
            </form.Field>

            {/* Description */}
            <form.Field name="description">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label>Description</Label>
                  <Textarea
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      const description = event.target.value;
                      field.handleChange(description);
                      scheduleTextSave({ id: item.id, title: form.state.values.title, description });
                    }}
                    className="min-h-20 resize-none"
                    placeholder="Details..."
                  />
                </div>
              )}
            </form.Field>

            {/* Status + Priority row */}
            <div className="grid grid-cols-2 gap-3">
              <form.Field name="status">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <Label>Status</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (!value) return;
                        field.handleChange(value);
                        queueSave(item.id, { status: value });
                      }}>
                      <SelectTrigger className="w-full">{STATUS_LABELS[field.state.value]}</SelectTrigger>
                      <SelectContent>
                        {AGENDA_ITEM_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>

              <form.Field name="priority">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <Label>Priority</Label>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (!value) return;
                        field.handleChange(value);
                        queueSave(item.id, { priority: value });
                      }}>
                      <SelectTrigger className="w-full">{PRIORITY_LABELS[field.state.value]}</SelectTrigger>
                      <SelectContent>
                        {AGENDA_ITEM_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {PRIORITY_LABELS[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
            </div>

            {/* Due date */}
            <form.Field name="dueDate">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label>Due Date</Label>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <div className="flex items-center gap-1.5">
                      <PopoverTrigger
                        className={cn(
                          'flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-muted/50',
                          !field.state.value && 'text-muted-foreground',
                        )}>
                        <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        {field.state.value ? formatDateInTz(dateToMs(field.state.value), timeZone) : 'Pick a date'}
                      </PopoverTrigger>
                      {field.state.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            field.handleChange(null);
                            queueSave(item.id, { dueAt: null });
                          }}>
                          <XIcon className="size-3" />
                        </Button>
                      )}
                    </div>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={field.state.value ?? undefined}
                        onSelect={(date) => {
                          field.handleChange(date ?? null);
                          setDatePickerOpen(false);
                          queueSave(item.id, { dueAt: date ? dateToMs(date) : null });
                        }}
                        defaultMonth={field.state.value ?? undefined}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </form.Field>
          </div>

          <SheetFooter className="flex flex-row items-center justify-between gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleteMutation.isPending}>
              <Trash2Icon className="size-3.5" />
              Delete
            </Button>
            {updateMutation.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete item?"
        description="This agenda item will be permanently removed."
        onConfirm={handleDelete}
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
