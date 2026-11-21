/**
 * BullMQ queue definitions.
 *
 * Why BullMQ over raw Redis pub/sub or RabbitMQ?
 * - Redis is already in the stack (required by spec). BullMQ uses Redis — no extra container.
 * - Job deduplication via jobId: critical for the double-approval race condition.
 *   If two approval actions both try to trigger cert generation, only one job runs.
 * - Retry with exponential backoff: WhatsApp is unreliable — jobs retry automatically.
 * - Repeatable jobs (cron): SLA watchdog runs every 15 min without manual triggers.
 * - Type-safe: full TypeScript support.
 *
 * Queues defined here:
 * - certificate:generation  → generates PDF + uploads to MinIO
 * - whatsapp:delivery       → sends cert link via mock WhatsApp provider
 * - sla:check               → cron job, finds batches stuck beyond SLA limits
 */
import { Queue } from 'bullmq'
import { redis } from '../lib/redis'

export const certificateQueue = new Queue('certificate:generation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
})

export const whatsappQueue = new Queue('whatsapp:delivery', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
})

export const slaQueue = new Queue('sla:check', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  },
})
