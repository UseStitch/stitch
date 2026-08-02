import { VideoIcon } from 'lucide-react';

import type { RecordingPlatform } from '@stitch/shared/recordings/types';

import { PLATFORM_CONFIG } from './formatting';

import { Icon } from '@/components/primitives/icon';
import { SimpleIcon } from '@/components/ui/simple-icon';
import { Table } from '@/components/ui/table';

export function PlatformBadge({ platform }: { platform: RecordingPlatform }) {
  const config = PLATFORM_CONFIG[platform] ?? PLATFORM_CONFIG.manual;

  return (
    <Table.IconText>
      {config.slug ? (
        <SimpleIcon slug={config.slug} className="size-3.5 shrink-0" fallback={<Icon as={VideoIcon} size="s" />} />
      ) : (
        <Icon as={VideoIcon} size="s" />
      )}
      <span>{config.label}</span>
    </Table.IconText>
  );
}
