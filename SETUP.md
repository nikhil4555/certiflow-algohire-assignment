# Local Setup Guide

## Prerequisites
- Node.js 20+
- Docker Desktop running
- Git

## Option A — Full Docker (for demo / submission)

```bash
git clone <repo-url>
cd certiflow

# Copy environment file
cp .env.example .env

# Build and start everything
docker-compose up --build

# In a separate terminal, run migrations and seed demo data
docker-compose exec backend npx --no prisma migrate deploy
docker-compose exec backend npx ts-node prisma/seed.ts
```

App runs at:
- Frontend: http://localhost:5173
- API: http://localhost:3000
- MinIO console: http://localhost:9001 (minioadmin / minioadmin)
- Mock WhatsApp messages: http://localhost:4000/messages

---

## Option B — Local dev with hot reload (recommended for development)

```bash
# 1. Start infrastructure only
docker-compose -f docker-compose.dev.yml up -d

# 2. Backend
cd backend
cp ../.env.example .env          # edit DATABASE_URL if needed
npm install
npx --no prisma migrate dev --name init
npx --no prisma generate
npx ts-node prisma/seed.ts
npm run dev                       # API on :3000

# 3. Worker (new terminal)
cd backend
npm run dev:worker

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev                       # UI on :5173

# 5. Mock WhatsApp (new terminal)
cd mock-whatsapp
npm install
npm run dev                       # Mock on :4000
```

---

## Demo Accounts (password: password123)

| Name  | Email                              | Role             |
|-------|------------------------------------|------------------|
| Anika | anika@sunrise-skills.com           | Training Centre  |
| Dev   | dev@pune.gov.in                    | District Officer |
| Meera | meera@pune.gov.in                  | District Officer |
| Kabir | kabir@pune.gov.in                  | District Officer |
| Neha  | neha@quality.pragati.gov.in        | Quality Team     |
| Farah | farah@state.pragati.gov.in         | State Office     |

## Demo Flow

1. Login as **Anika** → Upload Batch → select Pune District → submit CSV → Submit for Review
2. Login as **Dev** → Review Queue → Approve
3. Login as **Meera** → Review Queue → Approve (threshold met, batch advances)
4. Login as **Farah** → All Batches → open batch → Approve (triggers cert generation)
5. Watch worker logs — PDFs generate and WhatsApp jobs queue
6. Visit http://localhost:5173/verify/PSM-2024-XXXXXX to verify a cert publicly
7. Login as **Farah** → Dashboard → Cancel a certificate → verify again (shows cancelled)

## Sample CSV

```csv
name,phone,course_name,score
Rahul Sharma,9876543210,Welding Technology,82
Priya Patel,8765432109,Computer Basics,91
Amit Kumar,7654321098,Electrical Work,76
```

Save as `candidates.csv` and upload as Anika.
