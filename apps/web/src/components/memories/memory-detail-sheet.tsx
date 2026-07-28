import * as React from 'react';
import { z } from 'zod';

import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { MEMORY_CATEGORIES, MEMORY_CONFIDENCES } from '@stitch/shared/memory/types';

import { CATEGORY_LABELS, CONFIDENCE_LABELS } from '@/components/memories/constants';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/format';
import type { MemoryCategory, MemoryConfidence, SemanticMemory } from '@/lib/queries/memories';
import { deleteMemoryMutationOptions, updateMemoryMutationOptions } from '@/lib/queries/memories';

const DEBOUNCE_MS = 600;

const memoryDetailSchema = z.object({
  content: z.string(),
  category: z.enum(MEMORY_CATEGORIES),
  confidence: z.enum(MEMORY_CONFIDENCES),
});

type MemoryDetailValues = z.infer<typeof memoryDetailSchema>;

type MemoryUpdates = { content?: string; category?: MemoryCategory; confidence?: MemoryConfidence };
type PendingContentSave = { id: string; content: string };
type MemorySaveRequest = { id: string; updates: MemoryUpdates; started: boolean; cancelled: boolean };

type Props = { memory: SemanticMemory | null; open: boolean; onOpenChange: (open: boolean) => void };

export function MemoryDetailSheet({ memory, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  const updateMutation = useMutation(updateMemoryMutationOptions(queryClient));
  const deleteMutation = useMutation(deleteMemoryMutationOptions(queryClient));
  const form = useForm({
    defaultValues: {
      content: memory?.content ?? '',
      category: memory?.category ?? 'fact',
      confidence: memory?.confidence ?? 'stated',
    } satisfies MemoryDetailValues,
    validators: { onMount: memoryDetailSchema, onChange: memoryDetailSchema },
  });

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContentRef = React.useRef<PendingContentSave | null>(null);
  const pendingSavesRef = React.useRef<MemorySaveRequest[]>([]);
  const saveQueueRef = React.useRef(Promise.resolve());

  function queueSave(id: string, updates: MemoryUpdates) {
    const queued = pendingSavesRef.current.find((request) => request.id === id && !request.started);
    if (queued) {
      queued.updates = { ...queued.updates, ...updates };
      return;
    }

    const request: MemorySaveRequest = { id, updates, started: false, cancelled: false };
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

  function cancelPendingContent() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    pendingContentRef.current = null;
  }

  function flushPendingContent() {
    const pending = pendingContentRef.current;
    cancelPendingContent();
    if (pending) queueSave(pending.id, { content: pending.content });
  }

  function scheduleContentSave(pending: PendingContentSave) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pendingContentRef.current = pending;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      pendingContentRef.current = null;
      queueSave(pending.id, { content: pending.content });
    }, DEBOUNCE_MS);
  }

  const resetForm = React.useEffectEvent(() => {
    if (!memory) return;
    form.reset({ content: memory.content, category: memory.category, confidence: memory.confidence });
  });

  React.useEffect(() => {
    cancelPendingContent();
    resetForm();
    return cancelPendingContent;
  }, [memory?.id]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) flushPendingContent();
    onOpenChange(nextOpen);
  }

  async function handleDelete() {
    if (!memory) return;
    const id = memory.id;
    cancelPendingContent();
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

  if (!memory) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Memory</SheetTitle>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-space-xl px-space-xl">
            {/* Content */}
            <form.Field name="content">
              {(field) => (
                <Stack gap="s">
                  <Label>Content</Label>
                  <Textarea
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      const content = event.target.value;
                      field.handleChange(content);
                      scheduleContentSave({ id: memory.id, content });
                    }}
                    className="min-h-28 resize-none"
                    placeholder="Memory content..."
                  />
                </Stack>
              )}
            </form.Field>

            {/* Category */}
            <form.Field name="category">
              {(field) => (
                <Stack gap="s">
                  <Label>Category</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (!value) return;
                      field.handleChange(value);
                      queueSave(memory.id, { category: value });
                    }}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{CATEGORY_LABELS[field.state.value]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MEMORY_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {CATEGORY_LABELS[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Stack>
              )}
            </form.Field>

            {/* Confidence */}
            <form.Field name="confidence">
              {(field) => (
                <Stack gap="s">
                  <Label>Confidence</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (!value) return;
                      field.handleChange(value);
                      queueSave(memory.id, { confidence: value });
                    }}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{CONFIDENCE_LABELS[field.state.value]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MEMORY_CONFIDENCES.map((conf) => (
                        <SelectItem key={conf} value={conf}>
                          {CONFIDENCE_LABELS[conf]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Stack>
              )}
            </form.Field>

            {/* Read-only metadata */}
            <div className="rounded-lg border border-border bg-surface-sunken">
              <Stack gap="m" padding="l">
                <Stack direction="row" align="center" justify="between">
                  <Text as="span" variant="body" tone="muted">
                    Source
                  </Text>
                  <Badge variant="outline" className="capitalize">
                    {memory.source}
                  </Badge>
                </Stack>
                <Stack direction="row" align="center" justify="between">
                  <Text as="span" variant="body" tone="muted">
                    Accessed
                  </Text>
                  <Text as="span" variant="body">
                    {memory.accessCount} times
                  </Text>
                </Stack>
                <Stack direction="row" align="center" justify="between">
                  <Text as="span" variant="body" tone="muted">
                    Created
                  </Text>
                  <Text as="span" variant="body">
                    {formatDate(memory.createdAt)}
                  </Text>
                </Stack>
                <Stack direction="row" align="center" justify="between">
                  <Text as="span" variant="body" tone="muted">
                    Updated
                  </Text>
                  <Text as="span" variant="body">
                    {formatDate(memory.updatedAt)}
                  </Text>
                </Stack>
              </Stack>
            </div>
          </div>

          <SheetFooter className="flex flex-row items-center justify-between gap-space-m">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleteMutation.isPending}>
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
        title="Delete memory?"
        description="This memory will be permanently removed and cannot be recovered."
        onConfirm={handleDelete}
        pendingLabel="Deleting…"
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
