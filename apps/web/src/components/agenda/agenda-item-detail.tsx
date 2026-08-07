import { CalendarIcon, Trash2Icon, XIcon } from 'lucide-react';
import * as React from 'react';
import { z } from 'zod';

import { useForm } from '@tanstack/react-form';

import type { AgendaItem, AgendaItemPriority, AgendaItemStatus } from '@stitch/shared/agenda/types';
import { AGENDA_ITEM_PRIORITIES, AGENDA_ITEM_STATUSES } from '@stitch/shared/agenda/types';

import { PRIORITY_LABELS, STATUS_LABELS } from '@/components/agenda/constants';
import { formatDateInTz, useUserTimezone } from '@/components/agenda/utils';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
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
import { cn } from 'cnfast';


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

          <div className="flex flex-1 flex-col gap-space-xl px-space-xl">
            {/* List + Created info */}
            <Stack direction="row" align="center" gap="l">
              <Text as="span" variant="caption" tone="muted">
                {item.listName ?? 'Unknown'}
              </Text>
              <Text as="span" variant="caption" tone="muted">
                ·
              </Text>
              <Text as="span" variant="caption" tone="muted">
                Created {formatDateInTz(item.createdAt, timeZone)}
              </Text>
              {item.completedAt && (
                <>
                  <Text as="span" variant="caption" tone="muted">
                    ·
                  </Text>
                  <Text as="span" variant="caption" tone="muted">
                    Completed {formatDateInTz(item.completedAt, timeZone)}
                  </Text>
                </>
              )}
            </Stack>

            {/* Title */}
            <form.Field name="title">
              {(field) => (
                <Stack gap="s">
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
                </Stack>
              )}
            </form.Field>

            {/* Description */}
            <form.Field name="description">
              {(field) => (
                <Stack gap="s">
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
                </Stack>
              )}
            </form.Field>

            {/* Status + Priority row */}
            <div className="grid grid-cols-2 gap-space-l">
              <form.Field name="status">
                {(field) => (
                  <Stack gap="s">
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
                  </Stack>
                )}
              </form.Field>

              <form.Field name="priority">
                {(field) => (
                  <Stack gap="s">
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
                  </Stack>
                )}
              </form.Field>
            </div>

            {/* Due date */}
            <form.Field name="dueDate">
              {(field) => (
                <Stack gap="s">
                  <Label>Due Date</Label>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <Stack direction="row" align="center" gap="s">
                      <PopoverTrigger
                        className={cn(
                          'flex h-8 w-full items-center gap-space-m rounded-lg border border-input bg-transparent px-space-m text-sm transition-colors hover:bg-accent',
                          !field.state.value && 'text-muted-foreground',
                        )}>
                        <Icon as={CalendarIcon} size="s" tone="muted" />
                        {field.state.value ? formatDateInTz(dateToMs(field.state.value), timeZone) : 'Pick a date'}
                      </PopoverTrigger>
                      {field.state.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            field.handleChange(null);
                            queueSave(item.id, { dueAt: null });
                          }}>
                          <Icon as={XIcon} size="xs" />
                        </Button>
                      )}
                    </Stack>
                    <PopoverContent align="start" className="w-auto p-space-none">
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
                </Stack>
              )}
            </form.Field>
          </div>

          <SheetFooter className="flex flex-row items-center justify-between gap-space-m">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleteMutation.isPending}>
              <Icon as={Trash2Icon} size="s" />
              Delete
            </Button>
            {updateMutation.isPending && (
              <Text as="span" variant="caption" tone="muted">
                Saving…
              </Text>
            )}
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
