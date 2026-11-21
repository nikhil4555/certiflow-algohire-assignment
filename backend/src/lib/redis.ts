import IORedis from 'ioredis'
import { env } from '../config/env'
import { logger } from './logger'

/**
 * Shared Redis client used by:
 * 1. BullMQ queues and workers (job queue)
 * 2. Certificate verify cache (short TTL cache)
 * 3. SSE pub/sub if scaled to multiple instances (future)
 *
 * maxRetriesPerRequest: null is REQUIRED by BullMQ — it needs to block indefinitely
 * on BRPOP commands. Without this, BullMQ throws an error.
 */
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
})

redis.on('connect', () => logger.info('Redis connected'))
redis.on('error', (err) => logger.error({ err }, 'Redis error'))
redis.on('reconnecting', () => logger.warn('Redis reconnecting'))
