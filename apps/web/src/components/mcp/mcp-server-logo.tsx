import { WrenchIcon } from 'lucide-react';
import * as React from 'react';

import { getServerUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

type Props = {
  name: string;
  className?: string;
} & ({ registryId: string; serverId?: never } | { registryId?: never; serverId: string });

export function McpServerLogo({ name, className = 'size-4.5', ...props }: Props) {
  const [baseUrl, setBaseUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void getServerUrl().then((url) => {
      if (active) setBaseUrl(url);
    });
    return () => {
      active = false;
    };
  }, []);

  const logoPath =
    'registryId' in props ? `/mcp/registry/${props.registryId}/logo` : `/mcp/${props.serverId}/logo`;
  const logoUrl = baseUrl ? `${baseUrl}${logoPath}` : null;

  React.useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt=""
        aria-label={`${name} logo`}
        className={cn('shrink-0 rounded-sm object-contain', className)}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return <WrenchIcon className={cn('shrink-0 text-primary', className)} />;
}
