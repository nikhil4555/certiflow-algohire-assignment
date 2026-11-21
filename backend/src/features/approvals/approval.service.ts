import { prisma } from '../../lib/prisma'
import { AppError } from '../../middleware/error-handler'
import { enqueueCertificateGeneration } from '../../queues/producers'
import { sseManager } from '../../lib/sse'
import { logger } from '../../lib/logger'

type Action = 'APPROVED' | 'REJECTED' | 'RETURNED'

/** Batches with more candidates than this go through quality review */
const LARGE_BATCH_THRESHOLD = 50

/**
 * District officer submits their vote on a batch.
 *
 * Race condition handling:
 * The `SELECT ... FOR UPDATE` locks the batch row. If two officers approve
 * simultaneously, one transaction runs fully, the other waits, then re-counts
 * and finds the threshold already reached — so the batch advances exactly once.
 *
 * The UNIQUE(batchId, officerId, stage) constraint on batch_approvals is a
 * second layer — prevents double-voting even outside this transaction.
 */
export async function submitDistrictApproval(
  batchId: string,
  officerId: string,
  action: Action,
  reason?: string
) {
  const result = await prisma.$transaction(async (tx) => {
    // Lock the batch row — concurrent transactions queue up here
    const batches = await tx.$queryRaw<
      { id: string; status: string; district_id: string; candidate_count: number; training_centre_id: string }[]
    >`SELECT id, status, district_id, candidate_count, training_centre_id FROM batches WHERE id = ${batchId} FOR UPDATE`

    const batch = batches[0]
    if (!batch) throw new AppError('Batch not found', 404)
    if (batch.status !== 'DISTRICT_REVIEW') {
      throw new AppError(`Batch is not in district review (current: ${batch.status})`, 400)
    }

    // Verify this officer belongs to this batch's district
    const officer = await tx.user.findUnique({ where: { id: officerId } })
    if (officer?.districtId !== batch.district_id) {
      throw new AppError('You can only review batches in your district', 403)
    }

    // Record the vote — UNIQUE constraint prevents double-voting
    try {
      await tx.batchApproval.create({
        data: { batchId, officerId, stage: 'DISTRICT', action, reason: reason ?? null },
      })
    } catch (err: any) {
      if (err?.code === 'P2002') throw new AppError('You have already voted on this batch', 409)
      throw err
    }

    await tx.batchEvent.create({
      data: {
        batchId,
        eventType: `district_${action.toLowerCase()}`,
        actorId: officerId,
        metadata: { action, reason: reason ?? null },
      },
    })

    // Rejections and returns resolve immediately — no threshold needed
    if (action === 'REJECTED') {
      await tx.batch.update({ where: { id: batchId }, data: { status: 'REJECTED', returnReason: reason ?? null } })
      return { newStatus: 'REJECTED', trainingCentreId: batch.training_centre_id }
    }
    if (action === 'RETURNED') {
      await tx.batch.update({ where: { id: batchId }, data: { status: 'RETURNED', returnReason: reason ?? null } })
      return { newStatus: 'RETURNED', trainingCentreId: batch.training_centre_id }
    }

    // Check consensus threshold for approvals
    const district = await tx.district.findUnique({ where: { id: batch.district_id } })
    const approvalCount = await tx.batchApproval.count({
      where: { batchId, stage: 'DISTRICT', action: 'APPROVED' },
    })

    if (approvalCount >= (district?.requiredApprovals ?? 2)) {
      const nextStatus =
        batch.candidate_count > LARGE_BATCH_THRESHOLD ? 'QUALITY_REVIEW' : 'STATE_REVIEW'

      await tx.batch.update({ where: { id: batchId }, data: { status: nextStatus } })

      await tx.batchEvent.create({
        data: {
          batchId,
          eventType: `advanced_to_${nextStatus.toLowerCase()}`,
          metadata: { approvalCount, nextStatus, threshold: district?.requiredApprovals },
        },
      })

      return { newStatus: nextStatus, trainingCentreId: batch.training_centre_id }
    }

    return { newStatus: 'DISTRICT_REVIEW', trainingCentreId: batch.training_centre_id }
  })

  // SSE notifications (outside transaction)
  sseManager.sendToUser(result.trainingCentreId, 'batch:status_changed', {
    batchId,
    newStatus: result.newStatus,
  })

  logger.info({ batchId, action, newStatus: result.newStatus }, 'District approval recorded')
  return result
}

/** Quality team reviews a large batch */
export async function submitQualityApproval(
  batchId: string,
  officerId: string,
  action: Action,
  reason?: string
) {
  const result = await prisma.$transaction(async (tx) => {
    const batches = await tx.$queryRaw<
      { id: string; status: string; training_centre_id: string }[]
    >`SELECT id, status, training_centre_id FROM batches WHERE id = ${batchId} FOR UPDATE`

    const batch = batches[0]
    if (!batch) throw new AppError('Batch not found', 404)
    if (batch.status !== 'QUALITY_REVIEW') {
      throw new AppError(`Batch is not in quality review (current: ${batch.status})`, 400)
    }

    await tx.batchApproval.create({
      data: { batchId, officerId, stage: 'QUALITY', action, reason: reason ?? null },
    })

    await tx.batchEvent.create({
      data: {
        batchId,
        eventType: `quality_${action.toLowerCase()}`,
        actorId: officerId,
        metadata: { action, reason: reason ?? null },
      },
    })

    const newStatus =
      action === 'APPROVED' ? 'STATE_REVIEW' : action === 'REJECTED' ? 'REJECTED' : 'RETURNED'

    await tx.batch.update({
      where: { id: batchId },
      data: { status: newStatus, returnReason: action !== 'APPROVED' ? (reason ?? null) : null },
    })

    return { newStatus, trainingCentreId: batch.training_centre_id }
  })

  sseManager.sendToUser(result.trainingCentreId, 'batch:status_changed', {
    batchId,
    newStatus: result.newStatus,
  })

  return result
}

/**
 * State office gives final approval.
 * On APPROVED: triggers certificate generation for all candidates.
 */
export async function submitStateApproval(
  batchId: string,
  officerId: string,
  action: Action,
  reason?: string
) {
  const result = await prisma.$transaction(async (tx) => {
    const batches = await tx.$queryRaw<
      { id: string; status: string; training_centre_id: string }[]
    >`SELECT id, status, training_centre_id FROM batches WHERE id = ${batchId} FOR UPDATE`

    const batch = batches[0]
    if (!batch) throw new AppError('Batch not found', 404)
    if (batch.status !== 'STATE_REVIEW') {
      throw new AppError(`Batch is not in state review (current: ${batch.status})`, 400)
    }

    await tx.batchApproval.create({
      data: { batchId, officerId, stage: 'STATE', action, reason: reason ?? null },
    })

    await tx.batchEvent.create({
      data: {
        batchId,
        eventType: `state_${action.toLowerCase()}`,
        actorId: officerId,
        metadata: { action, reason: reason ?? null },
      },
    })

    const newStatus =
      action === 'APPROVED' ? 'APPROVED' : action === 'REJECTED' ? 'REJECTED' : 'RETURNED'

    await tx.batch.update({
      where: { id: batchId },
      data: { status: newStatus, returnReason: action !== 'APPROVED' ? (reason ?? null) : null },
    })

    return { newStatus, trainingCentreId: batch.training_centre_id, triggerCerts: action === 'APPROVED' }
  })

  if (result.triggerCerts) {
    // Enqueue certificate generation outside the transaction (avoids long-held locks)
    const candidates = await prisma.candidate.findMany({
      where: { batchId },
      select: { id: true },
    })
    await enqueueCertificateGeneration(batchId, candidates.map((c) => c.id))

    logger.info({ batchId, count: candidates.length }, 'Certificate generation enqueued')
  }

  sseManager.sendToUser(result.trainingCentreId, 'batch:status_changed', {
    batchId,
    newStatus: result.newStatus,
  })
  if (result.triggerCerts) {
    sseManager.broadcastToRole('STATE_OFFICE', 'batch:approved', { batchId })
  }

  return result
}
