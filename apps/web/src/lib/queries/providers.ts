import { queryOptions } from '@tanstack/react-query'
import { serverFetch } from '@/lib/api'

export type ProviderSummary = {
  id: string
  name: string
  api: string | undefined
  model_count: number
  enabled: boolean
}

export type ProviderCredentials = Record<string, unknown>

export const providerKeys = {
  all: ['providers'] as const,
  list: () => [...providerKeys.all, 'list'] as const,
  config: (providerId: string) => [...providerKeys.all, 'config', providerId] as const,
}

export const providersQueryOptions = queryOptions({
  queryKey: providerKeys.list(),
  queryFn: async (): Promise<ProviderSummary[]> => {
    const res = await serverFetch('/provider')
    if (!res.ok) throw new Error('Failed to fetch providers')
    return res.json() as Promise<ProviderSummary[]>
  },
})

export const providerConfigQueryOptions = (providerId: string) =>
  queryOptions({
    queryKey: providerKeys.config(providerId),
    queryFn: async (): Promise<ProviderCredentials | null> => {
      const res = await serverFetch(`/provider/${providerId}/config`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error('Failed to fetch provider config')
      return res.json() as Promise<ProviderCredentials>
    },
  })
