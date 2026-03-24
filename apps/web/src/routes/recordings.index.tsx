import { MicIcon } from 'lucide-react';

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/recordings/')({
  component: RecordingsIndexComponent,
});

function RecordingsIndexComponent() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <MicIcon className="size-12 text-muted-foreground/30" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Recordings</h1>
          <p className="text-sm text-muted-foreground">
            Select a recording from the sidebar to view its details.
          </p>
        </div>
      </div>
    </div>
  );
}
