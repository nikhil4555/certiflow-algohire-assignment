import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { AppError } from './error-handler'
import { Role } from '../types'

export interface AuthPayload {
  userId: string
  email: string
  name: string
  role: Role
  districtId?: string
}

// Extend Express Request so req.user is typed everywhere
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  // Support token in Authorization header OR query param (needed for EventSource/SSE)
  const authHeader = req.headers.authorization
  const queryToken = req.query.token as string | undefined

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : queryToken

  if (!token) {
    return next(new AppError('Authentication required', 401))
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload
    req.user = payload
    next()
  } catch {
    next(new AppError('Invalid or expired token', 401))
  }
}
