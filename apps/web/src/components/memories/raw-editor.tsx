import * as React from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ServerRequestError } from '@/lib/api';
import type { MemoryFileSnapshot, MemoryTarget } from '@/lib/queries/memories';
import { saveRawMemoryMutationOptions } from '@/lib/queries/memories';

export function RawEditor({ target, file }: { target: MemoryTarget; file: MemoryFileSnapshot }) {
  const queryClient = useQueryClient();
  const [editor, setEditor] = React.useState({ hash: file.contentHash, draft: file.rawContent });
  const [conflict, setConflict] = React.useState(false);
  const save = useMutation(saveRawMemoryMutationOptions(queryClient));
  if (!conflict && editor.hash !== file.contentHash) {
    setEditor({ hash: file.contentHash, draft: file.rawContent });
  }
  const draft = editor.draft;

  function saveRaw() {
    save.mutate(
      { target, content: draft, expectedHash: file.contentHash },
      {
        onSuccess: () => setConflict(false),
        onError: (error) => {
          if (!(error instanceof ServerRequestError && error.status === 409)) {
            return;
          }

          setConflict(true);
          void queryClient.invalidateQueries({ queryKey: ['memories'] });
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raw Markdown</CardTitle>
        <CardDescription>Manual text is preserved during consolidation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-space-s">
        <Textarea
          className="min-h-80 font-mono text-xs"
          value={draft}
          onChange={(event) => setEditor((current) => ({ ...current, draft: event.target.value }))}
        />
        {conflict ? (
          <div className="rounded-md border border-warning bg-surface-sunken p-space-m">
            <Text as="div" variant="body">
              <strong>File changed externally.</strong> Your draft is preserved above. The latest disk version is shown
              below for comparison.
              <pre className="mt-space-s max-h-40 overflow-auto whitespace-pre-wrap">{file.rawContent}</pre>
            </Text>
          </div>
        ) : null}
        <Stack direction="row" justify="end">
          <Button onClick={saveRaw} disabled={save.isPending || draft === file.rawContent}>
            {save.isPending ? 'Saving...' : 'Save Markdown'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
