import { Router } from 'express'
import { validate } from '../../middleware/validate'
import { loginSchema } from './auth.schema'
import { loginUser } from './auth.service'
import { authenticate } from '../../middleware/authenticate'

export const authRouter = Router()

/** POST /api/auth/login */
authRouter.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const result = await loginUser(req.body.email, req.body.password)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

/** GET /api/auth/me — returns current user from token */
authRouter.get('/me', authenticate, (req, res) => {
  res.json({ success: true, data: req.user })
})
