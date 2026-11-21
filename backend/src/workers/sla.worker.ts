import { Worker, Job } from 'bullmq'
import { redis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { sseManager } from '../lib/sse'
import { scheduleSlaCheck } from '../queues/producers'

/** SLA time limits in hours per stage */
const SLA_LIMITS: Record<string, number> = {
  DISTRICT_REVIEW: 24,
  QUALITY_REVIEW: 48,
  STATE_REVIEW: 24,
}

/**
 * SLA watchdog — runs every 15 minutes via BullMQ repeatable job.
 *
 * Finds batches that have been sitting at a stage longer than the SLA limit.
 * Creates a BatchEvent for observability and pushes a real-time alert to the
 * state office via SSE — no one needs to manually chase stuck batches.
 *
 * This satisfies: "A batch sits untouched with an officer for too long.
 * Someone senior finds out without anyone having to chase it."
 */
export const slaWorker = new Worker(
  'sla:check',
  async (_job: Job) => {
    logger.info('Running SLA check')
    let breachCount = 0

    for (const [status, maxHours] of Object.entries(SLA_LIMITS)) {
      const cutoff = new Date(Date.now() - maxHours * 60 * 60 * 1000)

      const staleBatches = await prisma.batch.findMany({
        where: { status: status as any, updatedAt: { lt: cutoff } },
        include: { district: true, trainingCentre: { select: { name: true } } },
      })

      for (const batch of staleBatches) {
        const hoursStuck = Math.round(
          (Date.now() - batch.updatedAt.getTime()) / (1000 * 60 * 60)
        )

        // Log to audit trail
        await prisma.batchEvent.create({
          data: {
            batchId: batch.id,
            eventType: 'sla_breach',
            metadata: { status, maxHours, hoursStuck, breachedAt: new Date().toISOString() },
          },
        })

        // Push real-time alert to state office
        sseManager.broadcastToRole('STATE_OFFICE', 'sla:breach', {
          batchId: batch.id,
          status,
          district: batch.district.name,
          trainingCentre: batch.trainingCentre.name,
          hoursStuck,
          maxHours,
        })

        logger.warn({ batchId: batch.id, status, hoursStuck }, 'SLA breach detected')
        breachCount++
      }
    }

    logger.info({ breachCount }, 'SLA check complete')
  },
  { connection: redis }
)

// Start the repeatable cron on worker init
scheduleSlaCheck().catch((err) =>
  logger.error({ err }, 'Failed to schedule SLA check')
)

slaWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'SLA check failed')
})
