/**
 * Environment variable validation using Zod.
 * The app crashes at startup with a clear error message if any required var is missing.
 * This is intentional — better to fail fast than to discover missing config at runtime.
 *
 * dotenv/config is imported first so .env is loaded before Zod reads process.env.
 * In Docker the env vars come from the compose file — dotenv is a no-op there.
 */
import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // local = filesystem (dev), s3 = MinIO/AWS S3 (prod)
  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('certiflow'),
  MINIO_USE_SSL: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  WHATSAPP_MOCK_URL: z.string().default('http://localhost:4000'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
})

const result = envSchema.safeParse(process.env)
if (!result.success) {
  console.error('❌ Invalid environment variables:')
  result.error.errors.forEach((e) => console.error(`  ${e.path.join('.')}: ${e.message}`))
  process.exit(1)
}

export const env = result.data
export type Env = typeof env
