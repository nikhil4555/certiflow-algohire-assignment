import { Request, Response, NextFunction } from 'express'
import { AppError } from './error-handler'
import { Role } from '../types'

/**
 * Role-based authorization middleware.
 * Usage: router.post('/approve', authenticate, authorize('DISTRICT_OFFICER', 'STATE_OFFICE'), handler)
 *
 * This ensures an officer cannot call state-office endpoints and vice versa.
 * Combined with ownership checks in service layer, this is the two-layer auth model.
 */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401))
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403))
    }
    next()
  }
}
