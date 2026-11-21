import { certificateQueue, whatsappQueue, slaQueue } from './index'

/**
 * Enqueue PDF generation for all candidates in a batch.
 *
 * jobId = `cert-gen-${candidateId}` — deduplication key.
 * If this function is called twice for the same batch (e.g. a network retry on the
 * approval request), BullMQ will not add a second job for a candidateId that already
 * has a pending/active job. Combined with the DB UNIQUE constraint on candidateId,
 * this gives two layers of duplicate prevention.
 */
export async function enqueueCertificateGeneration(
  batchId: string,
  candidateIds: string[]
): Promise<void> {
  const jobs = candidateIds.map((candidateId) => ({
    name: 'generate',
    data: { candidateId, batchId },
    opts: {
      jobId: `cert-gen-${candidateId}`,
    },
  }))
  await certificateQueue.addBulk(jobs)
}

/**
 * Enqueue WhatsApp delivery for a single certificate.
 *
 * jobId prevents double-delivery: if the generation worker crashes after creating
 * the cert but before marking completion, the job will be retried but WhatsApp
 * will not be called twice.
 */
export async function enqueueWhatsappDelivery(
  certificateId: string,
  phone: string
): Promise<void> {
  await whatsappQueue.add(
    'deliver',
    { certificateId, phone },
    { jobId: `wa-deliver-${certificateId}` }
  )
}

/**
 * Schedule the SLA check cron job.
 * Uses add() with repeat option — BullMQ 5.x approach for repeatable jobs.
 * The jobId ensures only one cron entry exists even if called multiple times.
 */
export async function scheduleSlaCheck(): Promise<void> {
  await slaQueue.add(
    'check',
    {},
    {
      jobId: 'sla-cron-singleton',
      repeat: { pattern: '*/15 * * * *' },
      removeOnComplete: true,
    }
  )
}
