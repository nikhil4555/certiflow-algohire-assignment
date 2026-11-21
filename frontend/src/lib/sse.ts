import { useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'

type EventHandler = (data: unknown) => void

/**
 * React hook for Server-Sent Events.
 * Connects to /api/events with the auth token as a query param
 * (EventSource doesn't support custom headers, so query param is the standard approach).
 * Automatically reconnects on error.
 */
export function useSSE(handlers: Record<string, EventHandler>) {
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token) return

    const es = new EventSource(`/api/events?token=${token}`)

    es.addEventListener('connected', () => {
      console.debug('[SSE] connected')
    })

    const removeListeners: (() => void)[] = []

    for (const [event, handler] of Object.entries(handlers)) {
      const listener = (e: MessageEvent) => {
        try {
          handler(JSON.parse(e.data))
        } catch {
          handler(e.data)
        }
      }
      es.addEventListener(event, listener)
      removeListeners.push(() => es.removeEventListener(event, listener))
    }

    es.onerror = () => {
      console.debug('[SSE] connection error — browser will reconnect automatically')
    }

    return () => {
      removeListeners.forEach((fn) => fn())
      es.close()
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps
}
