import { BoxIcon } from 'lucide-react';

import { RemoteMaskedIcon } from '@/components/icons/remote-icon';

type Props = { providerId: string; providerName: string; className?: string };

export function ProviderLogo({ providerId, providerName, className = 'size-4.5' }: Props) {
  return (
    <RemoteMaskedIcon
      path={`/llm/provider/${providerId}/logo`}
      label={`${providerName} logo`}
      className={`bg-info ${className}`}
      fallback={<BoxIcon className={`text-primary ${className}`} />}
    />
  );
}
