import { SparklesIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <SparklesIcon className="size-6" />
      </div>
      <div className="max-w-lg space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome to Stitch</h2>
        <p className="text-sm text-muted-foreground">
          Let&apos;s personalize your profile and connect your first provider so you can start chatting in less than a
          minute.
        </p>
      </div>
      <Button size="lg" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
