import { Response } from 'express'
import { logger } from './logger'

/**
 * SSE (Server-Sent Events) manager.
 *
 * Why SSE over WebSockets for this project:
 * All real-time updates here are server → client only (status changed, new batch assigned,
 * SLA alert). There's no client → server streaming. SSE is built into the browser
 * (EventSource API), works over plain HTTP, and needs zero extra libraries.
 *
 * Production note: This in-memory store works for a single API instance.
 * For multiple instances, replace with Redis pub/sub:
 *   publisher.publish(`sse:user:${userId}`, JSON.stringify({event, data}))
 *   subscriber.subscribe(`sse:user:${userId}`)
 */

interface ClientInfo {
  userId: string
  role: string
  districtId?: string
  res: Response
}

class SSEManager {
  // userId → list of open connections (user can have multiple tabs open)
  private clients: Map<string, ClientInfo[]> = new Map()

  addClient(userId: string, role: string, districtId: string | undefined, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering for SSE
    res.flushHeaders()

    const client: ClientInfo = { userId, role, districtId, res }
    const existing = this.clients.get(userId) ?? []
    existing.push(client)
    this.clients.set(userId, existing)

    // Initial ping confirms connection to client
    res.write('event: connected\ndata: {}\n\n')
    logger.debug({ userId, role }, 'SSE client connected')

    res.on('close', () => {
      const remaining = (this.clients.get(userId) ?? []).filter((c) => c !== client)
      this.clients.set(userId, remaining)
      logger.debug({ userId }, 'SSE client disconnected')
    })
  }

  /** Push event to a specific user (all their open tabs) */
  sendToUser(userId: string, event: string, data: unknown): void {
    const clients = this.clients.get(userId) ?? []
    this.write(clients, event, data)
  }

  /** Push event to all users with a given role */
  broadcastToRole(role: string, event: string, data: unknown): void {
    const matching: ClientInfo[] = []
    this.clients.forEach((clients) =>
      clients.filter((c) => c.role === role).forEach((c) => matching.push(c))
    )
    this.write(matching, event, data)
  }

  /** Push event to all district officers in a specific district */
  broadcastToDistrict(districtId: string, event: string, data: unknown): void {
    const matching: ClientInfo[] = []
    this.clients.forEach((clients) =>
      clients
        .filter((c) => c.districtId === districtId && c.role === 'DISTRICT_OFFICER')
        .forEach((c) => matching.push(c))
    )
    this.write(matching, event, data)
  }

  private write(clients: ClientInfo[], event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    clients.forEach((client) => {
      try {
        client.res.write(payload)
      } catch {
        // Client disconnected mid-write — ignore
      }
    })
  }
}

export const sseManager = new SSEManager()
