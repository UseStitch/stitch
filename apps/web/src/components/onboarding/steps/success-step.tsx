import { CheckCircle2Icon } from 'lucide-react';

export function SuccessStep() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2Icon className="size-8" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">You&apos;re all set</h2>
        <p className="text-sm text-muted-foreground">Setup complete. Launching your workspace...</p>
      </div>
    </div>
  );
}
