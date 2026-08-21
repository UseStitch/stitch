import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ManagedMemoryEntry, MemoryFileSnapshot, MemoryTarget } from '@stitch/shared/memory/types';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Textarea } from '@/components/ui/textarea';
import { addMemoryEntryMutationOptions, deleteMemoryEntryMutationOptions } from '@/lib/queries/memories';

export function CuratedFile({
  target,
  file,
  onEdit,
}: {
  target: MemoryTarget;
  file: MemoryFileSnapshot;
  onEdit: (entry: ManagedMemoryEntry) => void;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = React.useState(false);
  const [content, setContent] = React.useState('');
  const [entryToDelete, setEntryToDelete] = React.useState<ManagedMemoryEntry | null>(null);
  const add = useMutation(addMemoryEntryMutationOptions(queryClient));
  const remove = useMutation(deleteMemoryEntryMutationOptions(queryClient));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Managed entries</CardTitle>
          <CardDescription>{file.entries.length} entries</CardDescription>
          {!adding ? (
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <PlusIcon /> Add entry
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="max-h-128 space-y-space-m overflow-y-auto">
          <div className="grid grid-cols-1 gap-space-s md:grid-cols-2 lg:grid-cols-3">
            {file.entries.map((entry) => (
              <div key={entry.id} className="flex min-h-32 flex-col rounded-lg border border-border p-space-m">
                <Stack direction="row" align="start" justify="between" gap="s">
                  <span className="min-w-0 flex-1 wrap-break-word">{entry.content}</span>
                  <Stack direction="row" gap="xs">
                    <Button variant="ghost" size="icon-sm" onClick={() => onEdit(entry)} aria-label="Edit memory">
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      onClick={() => setEntryToDelete(entry)}
                      aria-label="Delete memory">
                      <Trash2Icon />
                    </Button>
                  </Stack>
                </Stack>
                <div className="mt-auto pt-space-m">
                  <Text as="span" variant="caption" tone="muted">
                    Observed {entry.observed}
                  </Text>
                </div>
              </div>
            ))}
          </div>
          {file.entries.length === 0 ? (
            <div className="py-space-xl text-center">
              <Text as="p" variant="body" tone="muted">
                No managed entries yet.
              </Text>
            </div>
          ) : null}
          {adding ? (
            <Stack gap="s">
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Durable memory..."
              />
              <Stack direction="row" gap="s">
                <Button
                  size="sm"
                  onClick={() =>
                    add.mutate(
                      { target, content },
                      {
                        onSuccess: () => {
                          setContent('');
                          setAdding(false);
                        },
                      },
                    )
                  }
                  disabled={!content.trim()}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </Stack>
            </Stack>
          ) : null}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={entryToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setEntryToDelete(null);
        }}
        title="Delete memory?"
        description="This managed entry will be removed from its canonical Markdown file."
        onConfirm={() => {
          if (!entryToDelete) return;
          remove.mutate(
            { id: entryToDelete.id, expectedHash: file.contentHash },
            { onSuccess: () => setEntryToDelete(null) },
          );
        }}
        isPending={remove.isPending}
        pendingLabel="Deleting..."
      />
    </>
  );
}
