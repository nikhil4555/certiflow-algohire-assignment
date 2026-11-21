import { z } from 'zod'

export const uploadBatchSchema = z.object({
  body: z.object({
    districtId: z.string().uuid('Invalid district ID'),
  }),
})

export const submitBatchSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
})
