import { BoxIcon } from 'lucide-react';
import * as React from 'react';

import { getServerUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

type SimpleIconProps = {
  slug: string;
  className?: string;
  fallback?: React.ReactNode;
};

export function SimpleIcon({ slug, className, fallback }: SimpleIconProps) {
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
    if (!baseUrl) return null;
    return `${baseUrl}/icons/simple-icons/${slug}`;
  }, [baseUrl, slug]);

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
        aria-label={slug}
        className={cn('bg-foreground', className)}
        style={{
          WebkitMask: `url(${logoUrl}) no-repeat center / contain`,
          mask: `url(${logoUrl}) no-repeat center / contain`,
        }}
      />
    );
  }

  if (failed && fallback) {
    return <>{fallback}</>;
  }

  return <BoxIcon className={cn('text-muted-foreground', className)} />;
}
