import { parse } from 'csv-parse/sync'
import { prisma } from '../../lib/prisma'
import { AppError } from '../../middleware/error-handler'
import { sseManager } from '../../lib/sse'
import { logger } from '../../lib/logger'

interface ParsedCandidate {
  name: string
  phone: string
  course_name: string
  score: number
}

interface ValidationError {
  row: number
  field: string
  message: string
}

/**
 * Parse and validate CSV buffer.
 *
 * Rules:
 * - If ANY row is invalid, return ALL errors with row numbers. Insert NOTHING.
 * - This satisfies: "They find out exactly what is wrong, and nothing half-saved
 *   ends up in the system."
 *
 * Expected CSV columns: name, phone, course_name, score
 */
export function parseCandidateCsv(buffer: Buffer): {
  candidates?: ParsedCandidate[]
  errors?: ValidationError[]
} {
  let rows: Record<string, string>[]

  try {
    rows = parse(buffer, { columns: true, skip_empty_lines: true, trim: true })
  } catch {
    throw new AppError('Invalid CSV format — ensure the file is a valid CSV', 400)
  }

  if (rows.length === 0) {
    throw new AppError('CSV file is empty', 400)
  }

  const errors: ValidationError[] = []
  const candidates: ParsedCandidate[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // +1 for 1-index, +1 for header row

    if (!row.name?.trim()) {
      errors.push({ row: rowNum, field: 'name', message: 'Name is required' })
    }

    if (!row.phone?.trim()) {
      errors.push({ row: rowNum, field: 'phone', message: 'Phone is required' })
    } else if (!/^[6-9]\d{9}$/.test(row.phone.trim())) {
      errors.push({ row: rowNum, field: 'phone', message: 'Must be a valid 10-digit Indian mobile number' })
    }

    if (!row.course_name?.trim()) {
      errors.push({ row: rowNum, field: 'course_name', message: 'Course name is required' })
    }

    const score = parseFloat(row.score)
    if (isNaN(score) || score < 0 || score > 100) {
      errors.push({ row: rowNum, field: 'score', message: 'Score must be a number between 0 and 100' })
    }

    if (errors.filter((e) => e.row === rowNum).length === 0) {
      candidates.push({
        name: row.name.trim(),
        phone: row.phone.trim(),
        course_name: row.course_name.trim(),
        score,
      })
    }
  }

  if (errors.length > 0) return { errors }
  return { candidates }
}

/**
 * Create a batch from a validated CSV buffer.
 * Uses a transaction — either all candidates are inserted or none.
 */
export async function createBatch(
  trainingCentreId: string,
  districtId: string,
  csvBuffer: Buffer
) {
  // Validate entire CSV first — partial saves are not allowed
  const { candidates, errors } = parseCandidateCsv(csvBuffer)
  if (errors) return { success: false as const, errors }

  const batch = await prisma.$transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: {
        trainingCentreId,
        districtId,
        status: 'DRAFT',
        candidateCount: candidates!.length,
      },
    })

    await tx.candidate.createMany({
      data: candidates!.map((c) => ({
        batchId: batch.id,
        name: c.name,
        phone: c.phone,
        courseName: c.course_name,
        score: c.score,
      })),
    })

    await tx.batchEvent.create({
      data: {
        batchId: batch.id,
        eventType: 'batch_created',
        actorId: trainingCentreId,
        metadata: { candidateCount: candidates!.length, districtId },
      },
    })

    return batch
  })

  return { success: true as const, batch }
}

/** Submit a DRAFT or RETURNED batch for review */
export async function submitBatch(batchId: string, trainingCentreId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } })
  if (!batch) throw new AppError('Batch not found', 404)
  if (batch.trainingCentreId !== trainingCentreId) {
    throw new AppError('You do not own this batch', 403)
  }
  if (!['DRAFT', 'RETURNED'].includes(batch.status)) {
    throw new AppError(`Cannot submit a batch in ${batch.status} status`, 400)
  }

  const updated = await prisma.batch.update({
    where: { id: batchId },
    data: { status: 'DISTRICT_REVIEW', submittedAt: new Date(), returnReason: null },
  })

  await prisma.batchEvent.create({
    data: {
      batchId,
      eventType: 'batch_submitted',
      actorId: trainingCentreId,
      metadata: { previousStatus: batch.status },
    },
  })

  // Notify district officers in real-time
  sseManager.broadcastToDistrict(batch.districtId, 'batch:submitted', {
    batchId,
    candidateCount: batch.candidateCount,
  })

  logger.info({ batchId }, 'Batch submitted for review')
  return updated
}

/** Get all batches visible to the current user */
export async function getBatches(userId: string, role: string, districtId?: string) {
  const where =
    role === 'TRAINING_CENTRE'
      ? { trainingCentreId: userId }
      : role === 'DISTRICT_OFFICER'
      ? { districtId, status: 'DISTRICT_REVIEW' as const }
      : role === 'QUALITY_TEAM'
      ? { status: 'QUALITY_REVIEW' as const }
      : {} // STATE_OFFICE sees all

  return prisma.batch.findMany({
    where: where as any,
    include: {
      trainingCentre: { select: { name: true } },
      district: { select: { name: true } },
      _count: { select: { candidates: true, certificates: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
}

/** Get single batch with full details */
export async function getBatch(batchId: string, userId: string, role: string, districtId?: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      trainingCentre: { select: { name: true } },
      district: { select: { name: true } },
      candidates: true,
      approvals: { include: { officer: { select: { name: true, role: true } } } },
      events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true } } } },
      _count: { select: { certificates: true } },
    },
  })

  if (!batch) throw new AppError('Batch not found', 404)

  // Authorization: training centres can only see their own batches
  if (role === 'TRAINING_CENTRE' && batch.trainingCentreId !== userId) {
    throw new AppError('Access denied', 403)
  }
  // District officers can only see batches in their district
  if (role === 'DISTRICT_OFFICER' && batch.districtId !== districtId) {
    throw new AppError('Access denied', 403)
  }

  return batch
}
