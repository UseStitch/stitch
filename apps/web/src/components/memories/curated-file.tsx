import { PlusIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { RawEditor } from '@/components/memories/raw-editor';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { ManagedMemoryEntry, MemoryFileSnapshot, MemoryTarget } from '@/lib/queries/memories';
import { addMemoryEntryMutationOptions } from '@/lib/queries/memories';

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
  const add = useMutation(addMemoryEntryMutationOptions(queryClient));

  return (
    <div className="grid gap-space-xl xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
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
        <CardContent className="space-y-space-s">
          {file.entries.map((entry) => (
            <Button
              key={entry.id}
              type="button"
              variant="outline"
              size="inline"
              width="full"
              align="start"
              onClick={() => onEdit(entry)}>
              <span className="block w-full p-space-m">
                <span className="block">{entry.content}</span>
                <div className="mt-space-xs">
                  <Text as="span" variant="caption" tone="muted">
                    Observed {entry.observed}
                  </Text>
                </div>
              </span>
            </Button>
          ))}
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
      <RawEditor target={target} file={file} />
    </div>
  );
}
