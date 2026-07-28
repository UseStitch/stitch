import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { AppearanceSelector } from '@/components/settings/appearance';
import { Button } from '@/components/ui/button';

type Props = { onContinue: () => void };

export function AppearanceStep({ onContinue }: Props) {
  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center gap-space-2xl">
      <div className="space-y-space-m text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Make Stitch yours</h2>
        <Text variant="body" tone="muted">
          Choose a mode and theme now. You can change this later in Settings.
        </Text>
      </div>

      <div className="space-y-space-2xl">
        <AppearanceSelector />
      </div>

      <Stack direction="row" justify="center">
        <Button onClick={onContinue}>Continue</Button>
      </Stack>
    </div>
  );
}
