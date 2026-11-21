import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { validate } from '../../middleware/validate'
import { prisma } from '../../lib/prisma'
import { redis } from '../../lib/redis'
import { getPresignedUrl } from '../../lib/minio'
import { AppError } from '../../middleware/error-handler'

export const certificateRouter = Router()

/** GET /api/certificates/:id/download — returns a pre-signed URL for the PDF */
certificateRouter.get('/:id/download', authenticate, async (req, res, next) => {
  try {
    const cert = await prisma.certificate.findUnique({
      where: { id: req.params.id },
      include: { candidate: { include: { batch: true } } },
    })

    if (!cert) throw new AppError('Certificate not found', 404)
    if (cert.status === 'CANCELLED') throw new AppError('This certificate has been cancelled', 410)
    if (!cert.pdfUrl) throw new AppError('PDF not yet generated', 404)

    // Authorization: training centre can only download certs for their batches
    if (
      req.user!.role === 'TRAINING_CENTRE' &&
      cert.candidate.batch.trainingCentreId !== req.user!.userId
    ) {
      throw new AppError('Access denied', 403)
    }

    const url = await getPresignedUrl(cert.pdfUrl)
    res.json({ success: true, data: { url, expiresIn: 900 } })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/certificates/:certificateNumber/cancel
 * State office only. Accepts the PSM-YYYY-XXXXXX number visible on the PDF.
 * Immediately invalidates the Redis cache so verify shows CANCELLED within seconds.
 */
certificateRouter.post(
  '/:certificateNumber/cancel',
  authenticate,
  authorize('STATE_OFFICE'),
  validate(z.object({
    params: z.object({
      // Accepts PSM-YYYY-XXXXXXXXXX format or a plain UUID
      certificateNumber: z.string().min(1, 'Certificate number is required'),
    }),
    body: z.object({ reason: z.string().min(1, 'Reason is required') }),
  })),
  async (req, res, next) => {
    try {
      const { certificateNumber } = req.params

      // Look up by certificateNumber (PSM-...) OR by internal UUID — handles both
      const cert = await prisma.certificate.findFirst({
        where: {
          OR: [
            { certificateNumber },
            { id: certificateNumber },
          ],
        },
      })

      if (!cert) throw new AppError('Certificate not found', 404)
      if (cert.status === 'CANCELLED') throw new AppError('Already cancelled', 400)

      const updated = await prisma.certificate.update({
        where: { id: cert.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: req.user!.userId,
        },
      })

      // Immediately purge Redis cache — next verify request hits DB directly
      await redis.del(`verify:${cert.certificateNumber}`)

      await prisma.batchEvent.create({
        data: {
          batchId: cert.batchId,
          eventType: 'certificate_cancelled',
          actorId: req.user!.userId,
          metadata: {
            certificateId: cert.id,
            certificateNumber: cert.certificateNumber,
            reason: req.body.reason,
          },
        },
      })

      res.json({
        success: true,
        data: { certificateNumber: cert.certificateNumber, status: 'CANCELLED' },
      })
    } catch (err) {
      next(err)
    }
  }
)

/** GET /api/certificates/batch/:batchId — list certs for a batch */
certificateRouter.get('/batch/:batchId', authenticate, async (req, res, next) => {
  try {
    const certs = await prisma.certificate.findMany({
      where: { batchId: req.params.batchId },
      include: { candidate: { select: { name: true, phone: true, courseName: true } }, deliveries: true },
    })
    res.json({ success: true, data: certs })
  } catch (err) {
    next(err)
  }
})
