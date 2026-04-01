import { BoxIcon } from 'lucide-react';
import * as React from 'react';

import { getServerUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

type ConnectorIconProps = {
  icon: string;
  className?: string;
};

export function ConnectorIcon({ icon, className }: ConnectorIconProps) {
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

  React.useEffect(() => {
    setFailed(false);
  }, [icon]);

  const logoUrl = baseUrl ? `${baseUrl}/connectors/icons/${icon}` : null;

  if (logoUrl && !failed) {
    return (
      <div
        role="img"
        aria-label={`${icon} icon`}
        className={cn('bg-foreground', className)}
        style={{
          WebkitMask: `url(${logoUrl}) no-repeat center / contain`,
          mask: `url(${logoUrl}) no-repeat center / contain`,
        }}
        onError={() => setFailed(true)}
      />
    );
  }

  return <BoxIcon className={cn('text-muted-foreground', className)} />;
}
