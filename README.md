# CertiFlow — Skilling Certificate Issuance Platform

> Built for the Pragati Skills Mission — a fictional state programme certifying ~8,000 trainees/month across 300+ training centres.

## Requirements

**Problem:** Centres email spreadsheets, officers approve over WhatsApp, clerks type certificates in Word. Batches take weeks, nobody can trace decisions, fake certificates are circulating.

**Solution:** One platform — batch upload → multi-stage approval → automated PDF generation → WhatsApp delivery → public QR verification.

---

## Architecture

```
React + Vite ──── REST / SSE ──── Express API ──── PostgreSQL (NeonDB in prod)
                                       │
                                   BullMQ (Redis)
                                       │
                                   Worker Process
                                  ┌────┴────┐
                               PDFKit    Mock WhatsApp
                                  │
                                MinIO (S3-compat)
```

**Two processes, one codebase:**
- `server.ts` — Express HTTP API
- `worker-entry.ts` — BullMQ workers (certificate generation, WhatsApp delivery, SLA cron)

Same Docker image, different `CMD`. Scale workers independently with `--scale worker=N`.

---

## Key Technical Decisions

### Event-Driven with BullMQ
The PDF requirement: *"WhatsApp is unreliable, including failing and timing out."*  
We can't block an HTTP request for 60 candidates × PDF generation + WhatsApp. BullMQ queues the work, workers handle it async with exponential-backoff retries. Redis was already required, so BullMQ adds zero infrastructure.

### Race Condition — Two Officers Approve Simultaneously
`SELECT ... FOR UPDATE` on the batch row inside a Prisma transaction. One transaction wins the lock, counts approvals, advances the batch. The other waits, re-counts, finds the threshold already passed — does nothing. The `UNIQUE(batchId, officerId, stage)` constraint on `batch_approvals` is a second layer of protection.

### No Duplicate Certificates
`UNIQUE(candidateId)` on the `certificates` table. Even if the generation job runs twice (crash-restart), the second `INSERT` fails at the database level. BullMQ `jobId = cert-gen-${candidateId}` deduplication prevents the job from running twice in the first place.

### Fake Certificate Detection
Every certificate gets a non-sequential number (`PSM-2024-{10 random hex chars}`) embedded as plain text and QR code in the PDF. The QR points to `/verify/{number}`. An employer scans it — if the name on the PDF doesn't match the name in our DB, it's fake.

### Cancelled Certificate Shows Invalid Immediately
Redis cache for verify results has a 10-second TTL. When state office cancels: `redis.del(verify:{certNumber})` is called immediately. Next verify request hits the DB within 10 seconds.

### Real-Time Updates
Server-Sent Events (not WebSockets). All updates are server→client only: status changes, new batches assigned, SLA alerts. SSE is built into the browser, works over plain HTTP, no extra library needed.

---

## Roles & Demo Users

| User  | Role | Email | Password |
|-------|------|-------|----------|
| Anika | Training Centre | anika@sunrise-skills.com | password123 |
| Dev | District Officer | dev@pune.gov.in | password123 |
| Meera | District Officer | meera@pune.gov.in | password123 |
| Kabir | District Officer | kabir@pune.gov.in | password123 |
| Neha | Quality Team | neha@quality.pragati.gov.in | password123 |
| Farah | State Office | farah@state.pragati.gov.in | password123 |

See [SETUP.md](./SETUP.md) for full setup instructions.

---

## Known Limitations / Next Steps

- WhatsApp idempotency: if provider accepts but response is lost before we save `providerMessageId`, a retry could double-send. Production fix: use provider-side deduplication key.
- SLA cron: repeatable job ID not fully unique in BullMQ 5.x edge case under high load — production fix: use a dedicated job scheduler table.
- Frontend: district list in upload form calls authenticated endpoint — no public endpoint for district lookup yet.
- Tests: unit tests for approval service and CSV validation are priority; E2E tests pending.

## AI Usage

Used Claude (Kiro) for initial architecture design and scaffolding. All code reviewed and understood line-by-line. Race condition logic, BullMQ queue setup, and Prisma transaction patterns were validated against official documentation.
