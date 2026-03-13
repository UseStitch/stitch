import { useQueryClient } from '@tanstack/react-query'
import { useSSE } from '@/hooks/use-sse'

export type DataChangePayload = {
  queryKey: readonly unknown[]
}

export function useSSEQueryInvalidation(): void {
  const queryClient = useQueryClient()

  useSSE({
    'data-change': (data) => {
      const payload = data as DataChangePayload
      if (Array.isArray(payload?.queryKey)) {
        void queryClient.invalidateQueries({ queryKey: payload.queryKey })
      }
    },
  })
}
