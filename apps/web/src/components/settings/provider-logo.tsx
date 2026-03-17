import { BoxIcon } from 'lucide-react';
import * as React from 'react';

import { getServerUrl } from '@/lib/api';

type Props = {
  providerId: string;
  providerName: string;
  className?: string;
};

export function ProviderLogo({ providerId, providerName, className = 'size-4.5' }: Props) {
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
  }, [providerId]);

  const logoUrl = baseUrl ? `${baseUrl}/provider/${providerId}/logo` : null;

  if (logoUrl && !failed) {
    return (
      <div
        role="img"
        aria-label={`${providerName} logo`}
        className={`bg-info ${className}`}
        style={{
          WebkitMask: `url(${logoUrl}) no-repeat center / contain`,
          mask: `url(${logoUrl}) no-repeat center / contain`,
        }}
        onError={() => setFailed(true)}
      />
    );
  }

  return <BoxIcon className={`text-primary ${className}`} />;
}
