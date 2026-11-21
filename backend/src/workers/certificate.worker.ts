import { Worker, Job } from 'bullmq'
import { redis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { enqueueWhatsappDelivery } from '../queues/producers'
import { generateCertificatePdf } from '../lib/pdf-generator'
import { uploadToStorage } from '../lib/minio'
import { generateCertificateNumber } from '../lib/cert-utils'
import { sseManager } from '../lib/sse'

interface CertJobData {
  candidateId: string
  batchId: string
}

/**
 * Certificate generation worker.
 *
 * Flow per job:
 * 1. Check if cert already exists (idempotent — safe to retry)
 * 2. Fetch candidate details
 * 3. Generate PDF buffer with PDFKit
 * 4. Upload to MinIO (private, pre-signed URLs for access)
 * 5. INSERT certificate (UNIQUE constraint on candidateId prevents any duplicate)
 * 6. Create WhatsApp delivery record
 * 7. Enqueue WhatsApp delivery job
 * 8. Notify training centre via SSE
 *
 * concurrency: 5 means up to 5 PDFs are generated in parallel per worker instance.
 */
export const certificateWorker = new Worker<CertJobData>(
  'certificate:generation',
  async (job: Job<CertJobData>) => {
    const { candidateId, batchId } = job.data

    // ── Idempotency check ────────────────────────────────────────────────
    // If the job retries (worker crash after DB insert), we skip generation.
    const existing = await prisma.certificate.findUnique({ where: { candidateId } })
    if (existing) {
      logger.info({ candidateId }, 'Certificate already exists — skipping generation')
      return { certificateId: existing.id, skipped: true }
    }

    // ── Fetch candidate ──────────────────────────────────────────────────
    const candidate = await prisma.candidate.findUniqueOrThrow({
      where: { id: candidateId },
      include: {
        batch: {
          include: {
            district: true,
            trainingCentre: { select: { id: true, name: true } },
          },
        },
      },
    })

    const certNumber = generateCertificateNumber()

    // ── Generate PDF ─────────────────────────────────────────────────────
    const pdfBuffer = await generateCertificatePdf({
      certNumber,
      candidateName: candidate.name,
      courseName: candidate.courseName,
      score: candidate.score.toString(),
      trainingCentre: candidate.batch.trainingCentre.name,
      district: candidate.batch.district.name,
      issuedAt: new Date(),
    })

    // ── Upload to MinIO ───────────────────────────────────────────────────
    const pdfKey = `certificates/${batchId}/${certNumber}.pdf`
    await uploadToStorage(pdfKey, pdfBuffer, 'application/pdf')

    // ── Save certificate (UNIQUE constraint is the hard guarantee) ────────
    const certificate = await prisma.certificate.create({
      data: {
        certificateNumber: certNumber,
        candidateId,
        batchId,
        pdfUrl: pdfKey,
        status: 'ACTIVE',
      },
    })

    logger.info({ certNumber, candidateId }, 'Certificate generated and stored')

    // ── Create delivery record ────────────────────────────────────────────
    await prisma.whatsappDelivery.create({
      data: {
        certificateId: certificate.id,
        phone: candidate.phone,
        status: 'PENDING',
      },
    })

    // ── Enqueue WhatsApp delivery ─────────────────────────────────────────
    await enqueueWhatsappDelivery(certificate.id, candidate.phone)

    // ── Notify training centre (real-time) ────────────────────────────────
    sseManager.sendToUser(candidate.batch.trainingCentreId, 'certificate:ready', {
      batchId,
      candidateId,
      certNumber,
    })

    return { certificateId: certificate.id, certNumber }
  },
  {
    connection: redis,
    concurrency: 5,
  }
)

certificateWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, candidateId: job?.data.candidateId, err }, 'Certificate generation failed')
})

certificateWorker.on('completed', (job) => {
  logger.debug({ jobId: job.id }, 'Certificate job completed')
})
