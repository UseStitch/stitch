import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { saveSettingMutationOptions } from '@/lib/queries/settings';

type Props = { onComplete: () => void; onBackToProviders: () => void };

export function MemoryStep({ onComplete }: Props) {
  const queryClient = useQueryClient();
  const saveEnabled = useMutation(saveSettingMutationOptions('memory.enabled', queryClient, { silent: true }));

  function choose(enabled: boolean) {
    void saveEnabled
      .mutateAsync(enabled ? 'true' : 'false')
      .then(onComplete)
      .catch(() => undefined);
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center gap-space-2xl">
      <div className="space-y-space-m text-center">
        <Text variant="heading-l">Enable memories?</Text>
        <Text variant="body" tone="muted">
          Stitch stores inspectable Markdown files locally. Curated preferences and durable context are available in
          future sessions without an embedding model.
        </Text>
      </div>
      <Stack direction="row" align="center" justify="center" gap="m">
        <Button variant="outline" onClick={() => choose(false)} disabled={saveEnabled.isPending}>
          Not now
        </Button>
        <Button onClick={() => choose(true)} disabled={saveEnabled.isPending}>
          {saveEnabled.isPending ? 'Saving...' : 'Enable memories'}
        </Button>
      </Stack>
    </div>
  );
}
