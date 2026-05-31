import { WrenchIcon } from 'lucide-react';

import { RemoteImageIcon } from '@/components/icons/remote-icon';
import { cn } from '@/lib/utils';

type Props = {
  name: string;
  className?: string;
} & ({ registryId: string; serverId?: never } | { registryId?: never; serverId: string });

export function McpServerLogo({ name, className = 'size-4.5', ...props }: Props) {
  const logoPath =
    'registryId' in props
      ? `/mcp/registry/${props.registryId}/logo`
      : `/mcp/${props.serverId}/logo`;
  return (
    <RemoteImageIcon
      path={logoPath}
      label={`${name} logo`}
      className={className}
      fallback={<WrenchIcon className={cn('shrink-0 text-primary', className)} />}
    />
  );
}
