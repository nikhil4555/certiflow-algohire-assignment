import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../../middleware/authenticate'
import { authorize } from '../../middleware/authorize'
import { createBatch, submitBatch, getBatches, getBatch } from './batch.service'
import { AppError } from '../../middleware/error-handler'
import { prisma } from '../../lib/prisma'

export const batchRouter = Router()

/** GET /api/batches/districts — public list of districts for the upload form */
batchRouter.get('/districts', authenticate, async (_req, res, next) => {
  try {
    const districts = await prisma.district.findMany({ orderBy: { name: 'asc' } })
    res.json({ success: true, data: districts })
  } catch (err) {
    next(err)
  }
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.endsWith('.csv')) {
      cb(new Error('Only .csv files are allowed'))
      return
    }
    cb(null, true)
  },
})

/** GET /api/batches — list batches visible to current user */
batchRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const batches = await getBatches(req.user!.userId, req.user!.role, req.user!.districtId)
    res.json({ success: true, data: batches })
  } catch (err) {
    next(err)
  }
})

/** GET /api/batches/:id */
batchRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    const batch = await getBatch(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      req.user!.districtId
    )
    res.json({ success: true, data: batch })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/batches/upload
 * Training centres upload a CSV to create a new batch.
 * Returns validation errors per row if CSV is invalid — nothing is saved.
 */
batchRouter.post(
  '/upload',
  authenticate,
  authorize('TRAINING_CENTRE'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('CSV file is required', 400)
      if (!req.body.districtId) throw new AppError('districtId is required', 400)

      const result = await createBatch(
        req.user!.userId,
        req.body.districtId,
        req.file.buffer
      )

      if (!result.success) {
        return res.status(400).json({ success: false, errors: result.errors })
      }

      res.status(201).json({ success: true, data: result.batch })
    } catch (err) {
      next(err)
    }
  }
)

/** POST /api/batches/:id/submit */
batchRouter.post(
  '/:id/submit',
  authenticate,
  authorize('TRAINING_CENTRE'),
  async (req, res, next) => {
    try {
      const batch = await submitBatch(req.params.id, req.user!.userId)
      res.json({ success: true, data: batch })
    } catch (err) {
      next(err)
    }
  }
)
