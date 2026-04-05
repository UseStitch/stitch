import { BoxIcon } from 'lucide-react';
import * as React from 'react';

import type { ConnectorIconSource } from '@stitch/shared/connectors/types';

import { getServerUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

type ConnectorIconProps = {
  icon: ConnectorIconSource;
  className?: string;
};

export function ConnectorIcon({ icon, className }: ConnectorIconProps) {
  const [baseUrl, setBaseUrl] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
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

  const logoUrl = React.useMemo(() => {
    if (icon.type === 'svgString') {
      return `data:image/svg+xml;utf8,${encodeURIComponent(icon.svgString)}`;
    }
    if (!baseUrl) return null;
    return `${baseUrl}/connectors/icons/simple-icons/${icon.slug}`;
  }, [baseUrl, icon]);

  React.useEffect(() => {
    if (!logoUrl) {
      setLoaded(false);
      setFailed(false);
      return;
    }

    let active = true;
    setLoaded(false);
    setFailed(false);

    const image = new Image();
    image.onload = () => {
      if (!active) return;
      setLoaded(true);
    };
    image.onerror = () => {
      if (!active) return;
      setFailed(true);
    };
    image.src = logoUrl;

    return () => {
      active = false;
    };
  }, [logoUrl]);

  if (logoUrl && loaded && !failed) {
    return (
      <div
        role="img"
        aria-label="connector icon"
        className={cn('bg-foreground', className)}
        style={{
          WebkitMask: `url(${logoUrl}) no-repeat center / contain`,
          mask: `url(${logoUrl}) no-repeat center / contain`,
        }}
      />
    );
  }

  return <BoxIcon className={cn('text-muted-foreground', className)} />;
}
