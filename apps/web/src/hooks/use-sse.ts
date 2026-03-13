import * as React from 'react'
import { getServerUrl } from '@/lib/api'

export type SseEventName = 'heartbeat' | 'connected' | 'data-change'

export type SseHandlers = Partial<Record<SseEventName, (data: unknown) => void>>

export type UseSseResult = {
  isConnected: boolean
  lastHeartbeat: Date | null
}

export function useSSE(handlers: SseHandlers = {}): UseSseResult {
  const [isConnected, setIsConnected] = React.useState(false)
  const [lastHeartbeat, setLastHeartbeat] = React.useState<Date | null>(null)
  const handlersRef = React.useRef(handlers)

  React.useEffect(() => {
    handlersRef.current = handlers
  })

  React.useEffect(() => {
    let eventSource: EventSource | null = null
    let cancelled = false

    getServerUrl().then((baseUrl) => {
      if (cancelled) return

      eventSource = new EventSource(`${baseUrl}/events`)

      eventSource.onopen = () => setIsConnected(true)

      eventSource.onerror = () => setIsConnected(false)

      eventSource.addEventListener('heartbeat', () => {
        setLastHeartbeat(new Date())
        handlersRef.current.heartbeat?.({ ts: Date.now() })
      })

      eventSource.addEventListener('connected', (e: MessageEvent) => {
        const data = parseJson(e.data)
        handlersRef.current.connected?.(data)
      })

      eventSource.addEventListener('data-change', (e: MessageEvent) => {
        const data = parseJson(e.data)
        handlersRef.current['data-change']?.(data)
      })
    })

    return () => {
      cancelled = true
      eventSource?.close()
      setIsConnected(false)
    }
  }, [])

  return { isConnected, lastHeartbeat }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}
