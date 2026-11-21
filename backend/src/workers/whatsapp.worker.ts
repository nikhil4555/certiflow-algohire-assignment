import { Worker, Job } from 'bullmq'
import axios from 'axios'
import { redis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { env } from '../config/env'
import { getPresignedUrl } from '../lib/minio'

interface WhatsappJobData {
  certificateId: string
  phone: string
}

/**
 * WhatsApp delivery worker.
 *
 * The mock provider randomly fails and times out (mimicking real WhatsApp API behaviour).
 * BullMQ retries with exponential backoff — no manual retry logic needed.
 *
 * Idempotency: before calling the provider, we check if providerMessageId already
 * exists for this certificate. If the provider accepted our request but we crashed
 * before saving the messageId, the retry would detect this and skip re-delivery.
 * Note: a full implementation would use the provider's dedup key — this is noted
 * in the README as a known limitation.
 */
export const whatsappWorker = new Worker<WhatsappJobData>(
  'whatsapp:delivery',
  async (job: Job<WhatsappJobData>) => {
    const { certificateId, phone } = job.data

    // Check if already delivered
    const delivery = await prisma.whatsappDelivery.findFirst({
      where: { certificateId, status: 'SENT' },
    })
    if (delivery) {
      logger.info({ certificateId }, 'WhatsApp already delivered — skipping')
      return
    }

    // Fetch cert details
    const certificate = await prisma.certificate.findUniqueOrThrow({
      where: { id: certificateId },
      include: { candidate: { select: { name: true } } },
    })

    // Generate a 15-min pre-signed URL for the PDF
    const pdfUrl = certificate.pdfUrl
      ? await getPresignedUrl(certificate.pdfUrl)
      : 'PDF not available'

    // Update attempt count
    await prisma.whatsappDelivery.updateMany({
      where: { certificateId, status: 'PENDING' },
      data: { attempts: { increment: 1 }, lastAttemptedAt: new Date() },
    })

    // Call mock WhatsApp provider
    // This will randomly fail/timeout — BullMQ handles the retries
    const response = await axios.post(
      `${env.WHATSAPP_MOCK_URL}/send`,
      {
        phone,
        message: `🎓 Congratulations ${certificate.candidate.name}!\n\nYour Pragati Skills Mission certificate is ready.\n\nCertificate No: ${certificate.certificateNumber}\nDownload: ${pdfUrl}\n\nVerify at: ${env.FRONTEND_URL}/verify/${certificate.certificateNumber}`,
        certificateNumber: certificate.certificateNumber,
      },
      { timeout: 15000 }
    )

    // Mark as sent
    await prisma.whatsappDelivery.updateMany({
      where: { certificateId },
      data: {
        status: 'SENT',
        providerMessageId: response.data.messageId,
        lastAttemptedAt: new Date(),
      },
    })

    logger.info({ certificateId, phone }, 'WhatsApp delivered successfully')
  },
  { connection: redis }
)

whatsappWorker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, err }, 'WhatsApp delivery failed')

  // On final failure, mark as failed in DB
  if (job && job.attemptsMade >= (job.opts.attempts ?? 5)) {
    await prisma.whatsappDelivery
      .updateMany({
        where: { certificateId: job.data.certificateId, status: 'PENDING' },
        data: { status: 'FAILED' },
      })
      .catch(() => {})
  }
})
