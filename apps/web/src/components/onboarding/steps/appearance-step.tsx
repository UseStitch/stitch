import { AppearanceSelector } from '@/components/settings/appearance';
import { Button } from '@/components/ui/button';

type Props = {
  onContinue: () => void;
};

export function AppearanceStep({ onContinue }: Props) {
  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center gap-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Make Stitch yours</h2>
        <p className="text-sm text-muted-foreground">
          Choose a mode and theme now. You can change this later in Settings.
        </p>
      </div>

      <div className="space-y-6">
        <AppearanceSelector />
      </div>

      <div className="flex justify-center">
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}
