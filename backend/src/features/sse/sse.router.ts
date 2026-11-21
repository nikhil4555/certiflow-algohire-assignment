import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate'
import { sseManager } from '../../lib/sse'

export const sseRouter = Router()

/**
 * GET /api/events
 *
 * Authenticated SSE endpoint. Clients connect here and receive real-time events.
 * Token can be passed as Authorization header OR as ?token= query param
 * (EventSource API in browsers doesn't support custom headers, so query param is needed).
 *
 * Events pushed:
 *   batch:submitted        → district officers, when training centre submits
 *   batch:status_changed   → training centre, when their batch moves stages
 *   batch:approved         → state office, on final approval
 *   certificate:ready      → training centre, when a certificate is generated
 *   sla:breach             → state office, when a batch is stuck too long
 */
sseRouter.get('/', authenticate, (req, res) => {
  sseManager.addClient(
    req.user!.userId,
    req.user!.role,
    req.user!.districtId,
    res
  )
})
