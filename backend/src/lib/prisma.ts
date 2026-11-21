import { PrismaClient } from '@prisma/client'
import { logger } from './logger'

// Singleton pattern — prevents creating multiple connections in dev with hot reload
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }]
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Log slow queries in development
if (process.env.NODE_ENV === 'development') {
  ;(prisma as any).$on('query', (e: any) => {
    if (e.duration > 100) {
      logger.warn({ duration: e.duration, query: e.query }, 'Slow query detected')
    }
  })
}
