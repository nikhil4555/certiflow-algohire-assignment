import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { logger } from '../lib/logger'

/** Operational errors — expected, user-facing, have a status code */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // Zod validation errors — return field-level details to the client
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    })
    return
  }

  // Prisma unique constraint violation (e.g. double-vote, duplicate cert)
  if ((err as any).code === 'P2002') {
    res.status(409).json({ success: false, error: 'Duplicate entry — this action was already performed' })
    return
  }

  // Known operational errors
  if (err instanceof AppError && err.isOperational) {
    res.status(err.statusCode).json({ success: false, error: err.message })
    return
  }

  // Unknown errors — log and return generic message (don't leak internals)
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error')
  res.status(500).json({ success: false, error: 'Internal server error' })
}
