import { CalendarIcon, Trash2Icon, XIcon } from 'lucide-react';
import * as React from 'react';

import type { AgendaItem, AgendaItemPriority, AgendaItemStatus } from '@stitch/shared/agenda/types';
import { AGENDA_ITEM_PRIORITIES, AGENDA_ITEM_STATUSES } from '@stitch/shared/agenda/types';

import { PRIORITY_LABELS, STATUS_LABELS } from '@/components/agenda/constants';
import { formatDateInTz, useUserTimezone } from '@/components/agenda/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useDeleteAgendaItem, useUpdateAgendaItem } from '@/lib/queries/agenda';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 600;

type Props = { item: AgendaItem | null; open: boolean; onOpenChange: (open: boolean) => void };

export function AgendaItemDetailSheet({ item, open, onOpenChange }: Props) {
  const timeZone = useUserTimezone();
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [status, setStatus] = React.useState<AgendaItemStatus>('open');
  const [priority, setPriority] = React.useState<AgendaItemPriority>('medium');
  const [dueDate, setDueDate] = React.useState<Date | undefined>(undefined);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);

  const updateMutation = useUpdateAgendaItem();
  const deleteMutation = useDeleteAgendaItem();

  // Keep a stable ref to the item so callbacks can access it without stale closures
  const itemRef = React.useRef(item);
  itemRef.current = item;

  React.useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description);
      setStatus(item.status);
      setPriority(item.priority);
      setDueDate(item.dueAt ? new Date(item.dueAt) : undefined);
    }
  }, [item]);

  function dateToMs(date: Date): number {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    return new Date(y, m, d, 12, 0, 0).getTime();
  }

  function save(updates: {
    title?: string;
    description?: string;
    status?: AgendaItemStatus;
    priority?: AgendaItemPriority;
    dueAt?: number | null;
  }) {
    if (!itemRef.current) return;
    updateMutation.mutate({ id: itemRef.current.id, updates });
  }

  // Debounced save for text fields
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function saveDebounced(updates: { title?: string; description?: string }) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(updates), DEBOUNCE_MS);
  }

  // Flush any pending debounced save when the sheet closes
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      const current = itemRef.current;
      if (current) {
        const pendingTitle = title !== current.title ? title : undefined;
        const pendingDescription = description !== current.description ? description : undefined;
        if (pendingTitle !== undefined || pendingDescription !== undefined) {
          save({ title: pendingTitle, description: pendingDescription });
        }
      }
    }
    onOpenChange(nextOpen);
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setTitle(next);
    if (itemRef.current && next !== itemRef.current.title) {
      saveDebounced({ title: next, description: undefined });
    }
  }

  function handleDescriptionChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setDescription(next);
    if (itemRef.current && next !== itemRef.current.description) {
      saveDebounced({ title: undefined, description: next });
    }
  }

  function handleStatusChange(v: string | null) {
    if (!v) return;
    const next = v as AgendaItemStatus;
    setStatus(next);
    if (itemRef.current && next !== itemRef.current.status) {
      save({ status: next });
    }
  }

  function handlePriorityChange(v: string | null) {
    if (!v) return;
    const next = v as AgendaItemPriority;
    setPriority(next);
    if (itemRef.current && next !== itemRef.current.priority) {
      save({ priority: next });
    }
  }

  function handleDateSelect(date: Date | undefined) {
    setDueDate(date);
    setDatePickerOpen(false);
    if (!itemRef.current) return;
    const newDueMs = date ? dateToMs(date) : null;
    if (newDueMs !== itemRef.current.dueAt) {
      save({ dueAt: newDueMs });
    }
  }

  function handleClearDate() {
    setDueDate(undefined);
    if (itemRef.current && itemRef.current.dueAt !== null) {
      save({ dueAt: null });
    }
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
            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={handleTitleChange} placeholder="Item title..." />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={handleDescriptionChange}
                className="min-h-20 resize-none"
                placeholder="Details..."
              />
            </div>

            {/* Status + Priority row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-full">{STATUS_LABELS[status]}</SelectTrigger>
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
                <Select value={priority} onValueChange={handlePriorityChange}>
                  <SelectTrigger className="w-full">{PRIORITY_LABELS[priority]}</SelectTrigger>
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

            {/* Due date */}
            <div className="flex flex-col gap-1.5">
              <Label>Due Date</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <div className="flex items-center gap-1.5">
                  <PopoverTrigger
                    className={cn(
                      'flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-muted/50',
                      !dueDate && 'text-muted-foreground',
                    )}>
                    <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    {dueDate ? formatDateInTz(dateToMs(dueDate), timeZone) : 'Pick a date'}
                  </PopoverTrigger>
                  {dueDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={handleClearDate}>
                      <XIcon className="size-3" />
                    </Button>
                  )}
                </div>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar mode="single" selected={dueDate} onSelect={handleDateSelect} defaultMonth={dueDate} />
                </PopoverContent>
              </Popover>
            </div>
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

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete item?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This agenda item will be permanently removed.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
