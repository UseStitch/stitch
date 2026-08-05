import * as React from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { ManagedMemoryEntry, MemoryFileSnapshot } from '@/lib/queries/memories';
import { deleteMemoryEntryMutationOptions, updateMemoryEntryMutationOptions } from '@/lib/queries/memories';

type Props = {
  entry: ManagedMemoryEntry | null;
  file: MemoryFileSnapshot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MemoryDetailSheet({ entry, file, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [content, setContent] = React.useState(entry?.content ?? '');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const update = useMutation(updateMemoryEntryMutationOptions(queryClient));
  const remove = useMutation(deleteMemoryEntryMutationOptions(queryClient));

  if (!entry || !file) return null;
  const selectedEntry = entry;
  const selectedFile = file;

  function save() {
    update.mutate(
      { id: selectedEntry.id, content, expectedHash: selectedFile.contentHash },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  function deleteEntry() {
    remove.mutate(
      { id: selectedEntry.id, expectedHash: selectedFile.contentHash },
      {
        onSuccess: () => {
          setConfirmDelete(false);
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit memory</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-space-m px-space-xl">
            <Label htmlFor="memory-content">Content</Label>
            <Textarea
              id="memory-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-40"
            />
            <Text as="p" variant="body" tone="muted">
              Observed {entry.observed} from {entry.source}. ID: {entry.id}
            </Text>
          </div>
          <SheetFooter className="flex-row justify-between">
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={remove.isPending}>
              Delete
            </Button>
            <Button onClick={save} disabled={!content.trim() || update.isPending}>
              {update.isPending ? 'Saving...' : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete memory?"
        description="This managed entry will be removed from its canonical Markdown file."
        onConfirm={deleteEntry}
        isPending={remove.isPending}
        pendingLabel="Deleting..."
      />
    </>
  );
}
