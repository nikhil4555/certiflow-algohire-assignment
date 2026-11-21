import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../../lib/prisma'
import { env } from '../../config/env'
import { AppError } from '../../middleware/error-handler'
import { AuthPayload } from '../../middleware/authenticate'

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { district: { select: { id: true, name: true } } },
  })

  if (!user) throw new AppError('Invalid email or password', 401)

  const passwordMatch = await bcrypt.compare(password, user.password)
  if (!passwordMatch) throw new AppError('Invalid email or password', 401)

  const payload: AuthPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as any,
    districtId: user.districtId ?? undefined,
  }

  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  })

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      district: user.district,
    },
  }
}
