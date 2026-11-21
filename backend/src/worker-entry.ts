/**
 * Worker process entry point.
 * Same codebase as the API server — different entry point, different role.
 *
 * This process handles all background jobs:
 * - Certificate PDF generation
 * - WhatsApp delivery (with retries)
 * - SLA watchdog cron
 *
 * Scale independently with: docker-compose up --scale worker=3
 * BullMQ handles job distribution across worker instances automatically.
 */
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import { redis } from './lib/redis'
import { ensureBucketExists } from './lib/minio'

// Importing workers registers them with BullMQ automatically
import { certificateWorker } from './workers/certificate.worker'
import { whatsappWorker } from './workers/whatsapp.worker'
import { slaWorker } from './workers/sla.worker'

async function startWorkers() {
  await prisma.$connect()
  logger.info('Worker: PostgreSQL connected')

  await redis.ping()
  logger.info('Worker: Redis connected')

  await ensureBucketExists()
  logger.info('Worker: MinIO bucket ready')

  logger.info('All workers started: certificate | whatsapp | sla')

  // Graceful shutdown — finish current jobs before stopping
  const shutdown = async () => {
    logger.info('Shutting down workers gracefully...')
    await Promise.all([
      certificateWorker.close(),
      whatsappWorker.close(),
      slaWorker.close(),
    ])
    await prisma.$disconnect()
    await redis.quit()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

startWorkers().catch((err) => {
  logger.error({ err }, 'Failed to start workers')
  process.exit(1)
})
