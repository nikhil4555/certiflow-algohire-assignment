/**
 * Seed script — creates demo data for all 6 personas from the problem statement.
 * Run: npm run db:seed
 * All users have password: password123
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding demo data...')

  // ─── Districts ──────────────────────────────────────────────────────────
  const puneDistrict = await prisma.district.upsert({
    where: { id: 'dist-pune-001' },
    update: {},
    create: {
      id: 'dist-pune-001',
      name: 'Pune District',
      requiredApprovals: 2, // Dev AND Meera (or Kabir) must both approve
    },
  })

  const nagpurDistrict = await prisma.district.upsert({
    where: { id: 'dist-nagpur-001' },
    update: {},
    create: {
      id: 'dist-nagpur-001',
      name: 'Nagpur District',
      requiredApprovals: 2,
    },
  })

  const hashedPassword = await bcrypt.hash('password123', 10)

  // ─── Users (from PDF demo setup) ────────────────────────────────────────
  const users = [
    {
      id: 'user-anika-001',
      name: 'Anika',
      email: 'anika@sunrise-skills.com',
      role: 'TRAINING_CENTRE' as const,
      districtId: puneDistrict.id,
    },
    {
      id: 'user-dev-001',
      name: 'Dev',
      email: 'dev@pune.gov.in',
      role: 'DISTRICT_OFFICER' as const,
      districtId: puneDistrict.id,
    },
    {
      id: 'user-meera-001',
      name: 'Meera',
      email: 'meera@pune.gov.in',
      role: 'DISTRICT_OFFICER' as const,
      districtId: puneDistrict.id,
    },
    {
      id: 'user-kabir-001',
      name: 'Kabir',
      email: 'kabir@pune.gov.in',
      role: 'DISTRICT_OFFICER' as const,
      districtId: puneDistrict.id,
    },
    {
      id: 'user-neha-001',
      name: 'Neha',
      email: 'neha@quality.pragati.gov.in',
      role: 'QUALITY_TEAM' as const,
      districtId: null,
    },
    {
      id: 'user-farah-001',
      name: 'Farah',
      email: 'farah@state.pragati.gov.in',
      role: 'STATE_OFFICE' as const,
      districtId: null,
    },
    {
      id: 'user-raj-001',
      name: 'Raj',
      email: 'raj@nagpur.gov.in',
      role: 'DISTRICT_OFFICER' as const,
      districtId: nagpurDistrict.id,
    },
    {
      id: 'user-priya-001',
      name: 'Priya',
      email: 'priya@nagpur.gov.in',
      role: 'DISTRICT_OFFICER' as const,
      districtId: nagpurDistrict.id,
    },
  ]

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, password: hashedPassword },
    })
  }

  console.log('✅ Seed complete\n')
  console.log('Demo logins (password: password123):')
  console.log('  anika@sunrise-skills.com    → Training Centre')
  console.log('  dev@pune.gov.in             → District Officer (Pune)')
  console.log('  meera@pune.gov.in           → District Officer (Pune)')
  console.log('  kabir@pune.gov.in           → District Officer (Pune)')
  console.log('  raj@nagpur.gov.in           → District Officer (Nagpur)')
  console.log('  priya@nagpur.gov.in         → District Officer (Nagpur)')
  console.log('  neha@quality.pragati.gov.in → Quality Team')
  console.log('  farah@state.pragati.gov.in  → State Office')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
