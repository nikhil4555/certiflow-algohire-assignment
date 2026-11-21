import { randomBytes } from 'crypto'

/**
 * Generate a non-sequential, hard-to-guess certificate number.
 *
 * Format: PSM-{year}-{10 random hex chars uppercase}
 * Example: PSM-2024-A3F9C02E1B
 *
 * Why not sequential (1, 2, 3...)?
 * Sequential numbers let attackers enumerate all valid certificate numbers.
 * With 10 random hex chars = 16^10 = ~1 trillion combinations.
 * Guessing a valid number at random is infeasible.
 */
export function generateCertificateNumber(): string {
  const year = new Date().getFullYear()
  const random = randomBytes(5).toString('hex').toUpperCase()
  return `PSM-${year}-${random}`
}
