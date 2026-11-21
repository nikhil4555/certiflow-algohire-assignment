import express from 'express'
import path from 'path'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { env } from './config/env'
import { errorHandler } from './middleware/error-handler'
import { authRouter } from './features/auth/auth.router'
import { batchRouter } from './features/batches/batch.router'
import { approvalRouter } from './features/approvals/approval.router'
import { certificateRouter } from './features/certificates/certificate.router'
import { verifyRouter } from './features/verify/verify.router'
import { sseRouter } from './features/sse/sse.router'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }))

  // Rate limit â€” higher limit for public verify endpoint (thousands of lookups/day)
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      skip: (req) => req.path.startsWith('/api/verify'),
    })
  )
  app.use(rateLimit({ windowMs: 60 * 1000, max: 300, skip: (req) => !req.path.startsWith('/api/verify') }))

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // Serve uploaded files in local dev mode
  if (process.env.STORAGE_TYPE !== 's3') {
    app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))
  }

  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  )

  app.use('/api/auth', authRouter)
  app.use('/api/batches', batchRouter)
  app.use('/api/approvals', approvalRouter)
  app.use('/api/certificates', certificateRouter)
  app.use('/api/verify', verifyRouter)
  app.use('/api/events', sseRouter)

  app.use(errorHandler)

  return app
}
