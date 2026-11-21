import { Request, Response, NextFunction } from 'express'
import { AnyZodObject } from 'zod'

/**
 * Zod request validation middleware.
 * Pass a schema that validates { body, query, params } — Zod throws on invalid input,
 * which is caught by the global error handler and returned as a 400 with field details.
 */
export function validate(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({ body: req.body, query: req.query, params: req.params })
      next()
    } catch (err) {
      next(err)
    }
  }
}
