import { VideoIcon } from 'lucide-react';
import * as React from 'react';

import type { RecordingPlatform } from '@stitch/shared/recordings/types';

import { PLATFORM_CONFIG } from './formatting';

import { SimpleIcon } from '@/components/ui/simple-icon';
import { Table } from '@/components/ui/table';

export const PlatformBadge = React.memo(function PlatformBadge({
  platform,
}: {
  platform: RecordingPlatform;
}) {
  const config = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.manual;

  return (
    <Table.IconText>
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
    </Table.IconText>
  );
});
