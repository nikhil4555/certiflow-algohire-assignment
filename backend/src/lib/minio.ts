import * as fsLib from 'fs'
import * as path from 'path'
import * as Minio from 'minio'
import { env } from '../config/env'
import { logger } from './logger'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

function ensureLocalDir(filePath: string): void {
  const dir = path.dirname(path.join(UPLOADS_DIR, filePath))
  if (!fsLib.existsSync(dir)) fsLib.mkdirSync(dir, { recursive: true })
}

let _minioClient: Minio.Client | null = null
function getMinioClient(): Minio.Client {
  if (!_minioClient) {
    _minioClient = new Minio.Client({
      endPoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSSL: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
    })
  }
  return _minioClient
}

export async function ensureBucketExists(): Promise<void> {
  if (env.STORAGE_TYPE === 'local') {
    if (!fsLib.existsSync(UPLOADS_DIR)) fsLib.mkdirSync(UPLOADS_DIR, { recursive: true })
    logger.info({ dir: UPLOADS_DIR }, 'Local file storage ready')
    return
  }
  const client = getMinioClient()
  const exists = await client.bucketExists(env.MINIO_BUCKET)
  if (!exists) {
    await client.makeBucket(env.MINIO_BUCKET, 'us-east-1')
    logger.info({ bucket: env.MINIO_BUCKET }, 'MinIO bucket created')
  }
}

export async function uploadToStorage(key: string, buffer: Buffer, contentType: string): Promise<void> {
  if (env.STORAGE_TYPE === 'local') {
    ensureLocalDir(key)
    fsLib.writeFileSync(path.join(UPLOADS_DIR, key), buffer)
    return
  }
  await getMinioClient().putObject(env.MINIO_BUCKET, key, buffer, buffer.length, { 'Content-Type': contentType })
}

export async function getPresignedUrl(key: string, expirySeconds = 900): Promise<string> {
  if (env.STORAGE_TYPE === 'local') {
    const apiBase = env.FRONTEND_URL.replace(':5173', ':3000')
    return apiBase + '/uploads/' + key
  }
  return getMinioClient().presignedGetObject(env.MINIO_BUCKET, key, expirySeconds)
}
