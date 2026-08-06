import { Trash2Icon } from 'lucide-react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { MemoryFileSnapshot } from '@/lib/queries/memories';
import { deleteMemoryEntryMutationOptions } from '@/lib/queries/memories';

export function DailyFile({ file, processedIds }: { file: MemoryFileSnapshot; processedIds: Set<string> }) {
  const queryClient = useQueryClient();
  const remove = useMutation(deleteMemoryEntryMutationOptions(queryClient));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{file.name.replace('daily/', '').replace('.md', '')}</CardTitle>
        <CardDescription>{file.entries.length} candidates</CardDescription>
      </CardHeader>
      <CardContent className="space-y-space-s">
        {file.entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-start justify-between gap-space-m rounded-lg border border-border p-space-m">
            <div>
              <p>{entry.content}</p>
              <div className="mt-space-xs">
                <Text as="p" variant="caption" tone="muted">
                  {entry.target} from {entry.source} - {processedIds.has(entry.id) ? 'reviewed' : 'pending'}
                </Text>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => remove.mutate({ id: entry.id, expectedHash: file.contentHash })}
              aria-label="Delete candidate">
              <Trash2Icon />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
