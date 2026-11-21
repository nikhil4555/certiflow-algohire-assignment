import { createApp } from './app'
import { env } from './config/env'
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import { redis } from './lib/redis'
import { ensureBucketExists } from './lib/minio'

async function start() {
  // Validate all connections before accepting traffic
  await prisma.$connect()
  logger.info('PostgreSQL connected')

  // ioredis auto-connects on first command when lazyConnect is true.
  // BullMQ queue instances imported elsewhere already trigger a connection,
  // so calling redis.connect() again throws "already connecting/connected".
  // Ping instead to verify the connection is live without double-connecting.
  await redis.ping()
  logger.info('Redis connected')

  await ensureBucketExists()
  logger.info('MinIO bucket ready')

  const app = createApp()

  const server = app.listen(env.PORT, () => {
    logger.info(`API server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`)
  })

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...')
    server.close()
    await prisma.$disconnect()
    await redis.quit()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server')
  process.exit(1)
})
