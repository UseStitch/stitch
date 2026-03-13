import * as React from 'react'
import type { SseEventName, SseHandlers, UseSseResult } from '@openwork/shared'
import { getServerUrl } from '@/lib/api'

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

      addSseListener(eventSource, 'heartbeat', () => {
        setLastHeartbeat(new Date())
        handlersRef.current.heartbeat?.({ ts: Date.now() })
      })

      addSseListener(eventSource, 'connected', (e) => {
        handlersRef.current.connected?.(parseJson(e.data))
      })

      addSseListener(eventSource, 'data-change', (e) => {
        handlersRef.current['data-change']?.(parseJson(e.data))
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

function addSseListener(
  source: EventSource,
  event: SseEventName,
  listener: (e: MessageEvent) => void,
): void {
  source.addEventListener(event, listener as EventListener)
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}
