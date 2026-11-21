import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import { submitDistrictApproval, submitQualityApproval, submitStateApproval } from './approval.service'

export const approvalRouter = Router()

const approvalSchema = z.object({
  params: z.object({ batchId: z.string().uuid() }),
  body: z.object({
    action: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
    reason: z.string().optional(),
  }),
})

/** POST /api/approvals/district/:batchId */
approvalRouter.post(
  '/district/:batchId',
  authenticate,
  authorize('DISTRICT_OFFICER'),
  validate(approvalSchema),
  async (req, res, next) => {
    try {
      const result = await submitDistrictApproval(
        req.params.batchId,
        req.user!.userId,
        req.body.action,
        req.body.reason
      )
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  }
)

/** POST /api/approvals/quality/:batchId */
approvalRouter.post(
  '/quality/:batchId',
  authenticate,
  authorize('QUALITY_TEAM'),
  validate(approvalSchema),
  async (req, res, next) => {
    try {
      const result = await submitQualityApproval(
        req.params.batchId,
        req.user!.userId,
        req.body.action,
        req.body.reason
      )
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  }
)

/** POST /api/approvals/state/:batchId */
approvalRouter.post(
  '/state/:batchId',
  authenticate,
  authorize('STATE_OFFICE'),
  validate(approvalSchema),
  async (req, res, next) => {
    try {
      const result = await submitStateApproval(
        req.params.batchId,
        req.user!.userId,
        req.body.action,
        req.body.reason
      )
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  }
)
