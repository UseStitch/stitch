import * as React from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { providersQueryOptions, type ProviderSummary } from '@/lib/queries/providers'
import { ProviderRow } from '@/components/settings/provider-row'
import { ProviderConfig } from '@/components/settings/provider-config'

function ProviderList({ onSelect }: { onSelect: (provider: ProviderSummary) => void }) {
  const { data: providers } = useSuspenseQuery(providersQueryOptions)

  const connected = providers.filter((p) => p.enabled)
  const unconnected = providers.filter((p) => !p.enabled)

  return (
    <div className="flex flex-col gap-6">
      {connected.length > 0 && (
        <div className="flex flex-col">
          <h3 className="text-[13px] font-semibold mb-2">Connected providers</h3>
          <div className="flex flex-col">
            {connected.map((provider) => (
              <ProviderRow key={provider.id} provider={provider} onSelect={() => onSelect(provider)} />
            ))}
          </div>
        </div>
      )}

      {unconnected.length > 0 && (
        <div className="flex flex-col">
          <h3 className="text-[13px] font-semibold mb-2">Popular providers</h3>
          <div className="flex flex-col">
            {unconnected.map((provider) => (
              <ProviderRow key={provider.id} provider={provider} onSelect={() => onSelect(provider)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ProvidersSettings() {
  const [selected, setSelected] = React.useState<ProviderSummary | null>(null)

  return (
    <div className="flex flex-col h-full">
      {!selected && (
        <div className="mb-4">
          <h2 className="text-[15px] font-bold">Providers</h2>
        </div>
      )}
      <React.Suspense fallback={<div className="text-muted-foreground text-sm">Loading providers...</div>}>
        {selected ? (
          <ProviderConfig provider={selected} onBack={() => setSelected(null)} />
        ) : (
          <ProviderList onSelect={setSelected} />
        )}
      </React.Suspense>
    </div>
  )
}
