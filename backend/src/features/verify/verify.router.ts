import { Router } from 'express'
import { redis } from '../../lib/redis'
import { prisma } from '../../lib/prisma'

export const verifyRouter = Router()

/**
 * GET /api/verify/:certificateNumber
 *
 * Public — no authentication required. Anyone (employers, public) can call this.
 *
 * Cache strategy: 10-second Redis TTL.
 * Short TTL means a cancelled certificate shows as invalid within 10 seconds.
 * When state office cancels, it also calls redis.del(key) for immediate invalidation.
 *
 * Returns minimal data only — no phone numbers, no batch internals.
 * Enough for an employer to verify: is this person real, did they complete this course?
 */
verifyRouter.get('/:certificateNumber', async (req, res, next) => {
  try {
    const { certificateNumber } = req.params
    const cacheKey = `verify:${certificateNumber}`

    // Check cache first
    const cached = await redis.get(cacheKey)
    if (cached) {
      const data = JSON.parse(cached)
      return res.json({ success: true, data, cached: true })
    }

    const certificate = await prisma.certificate.findUnique({
      where: { certificateNumber },
      select: {
        certificateNumber: true,
        status: true,
        issuedAt: true,
        cancelledAt: true,
        candidate: {
          select: {
            name: true,
            courseName: true,
            score: true,
            batch: {
              select: {
                district: { select: { name: true } },
                trainingCentre: { select: { name: true } },
              },
            },
          },
        },
      },
    })

    if (!certificate) {
      // Cache negative result too — prevents repeated DB hits from enumeration attacks
      await redis.setex(cacheKey, 10, JSON.stringify(null))
      return res.status(404).json({ success: false, error: 'Certificate not found' })
    }

    const result = {
      certificateNumber: certificate.certificateNumber,
      status: certificate.status,
      issuedAt: certificate.issuedAt,
      cancelledAt: certificate.cancelledAt ?? null,
      candidateName: certificate.candidate.name,
      courseName: certificate.candidate.courseName,
      score: certificate.candidate.score,
      trainingCentre: certificate.candidate.batch.trainingCentre.name,
      district: certificate.candidate.batch.district.name,
    }

    await redis.setex(cacheKey, 10, JSON.stringify(result))
    res.json({ success: true, data: result, cached: false })
  } catch (err) {
    next(err)
  }
})
