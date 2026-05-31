import { VideoIcon } from 'lucide-react';
import * as React from 'react';

import type { RecordingPlatform } from '@stitch/shared/recordings/types';

import { SimpleIcon } from '@/components/ui/simple-icon';

import { PLATFORM_CONFIG } from './formatting';

export const PlatformBadge = React.memo(function PlatformBadge({
  platform,
}: {
  platform: RecordingPlatform;
}) {
  const config = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.manual;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {config.slug ? (
        <SimpleIcon
          slug={config.slug}
          className="size-3.5 shrink-0"
          fallback={<VideoIcon className="size-3.5 shrink-0" />}
        />
      ) : (
        <VideoIcon className="size-3.5 shrink-0" />
      )}
      <span>{config.label}</span>
    </div>
  );
});
