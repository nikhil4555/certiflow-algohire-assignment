# CertiFlow — Tech Stack & Review Prep

> Use this as your study guide before the presentation. Each section covers what it is, why we chose it, and the question a reviewer will likely ask you.

---

## 1. The Big Picture — How Everything Connects

```
Browser (React)
    │
    │  HTTP/SSE
    ▼
[Nginx] ──── serves static files (HTML/JS/CSS)
    │         ──── proxies /api/* → backend:3000
    │
    ▼
[Express API] ──── reads/writes ──── [PostgreSQL]
    │                                    (Prisma ORM)
    │  enqueues jobs
    ▼
[Redis] ◄──── BullMQ queue
    │
    ▼
[Worker Process] ──── generates PDFs ──── [LocalStack S3]
                 ──── calls Mock WhatsApp
                 ──── SLA cron every 15 min
```

**Two Node.js processes, one codebase.**
- `server.ts` → Express HTTP API (handles requests, enqueues jobs, responds fast)
- `worker-entry.ts` → BullMQ workers (does the slow work in background)

Same Docker image, different `CMD`. Scale workers independently.

---

## 2. Nginx — Why It's Here

### What Nginx Does in This Project

In **development** — nginx is NOT used. Vite dev server runs directly on port 5173.

In **production Docker** (the submitted demo) — Vite builds static files, nginx serves them.

### Why Nginx and Not Just Node?

**1. SPA Routing Problem**

React uses client-side routing. The routes (`/batches/123`, `/verify/PSM-2024-ABC`) only exist in React Router — the server has no such files.

Without nginx: User refreshes `/batches/123` → server looks for a file called `batches/123` → 404.

With nginx `try_files`:
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```
"Check if the file exists → if not, serve `index.html`". React Router takes over and renders the right page. This is mandatory for any React SPA in production.

**2. API Reverse Proxy — Single Origin**

Without nginx, the browser would talk to two origins: `localhost:5173` (frontend) and `localhost:3000` (backend). Browsers block cross-origin requests by default (CORS). You can configure CORS headers, but the cleaner solution is a single origin.

With nginx, everything is on port 80. `/api/*` calls are proxied internally to the backend container:
```nginx
location /api/ {
    proxy_pass http://backend:3000;
}
```
The browser never knows there are two services. No CORS needed.

**3. SSE Needs Buffering Disabled**

SSE (Server-Sent Events) streams data continuously. By default, nginx buffers responses and sends them in chunks when the buffer fills up — which completely breaks SSE (events arrive in batches or not at all).

```nginx
location /api/events {
    proxy_buffering off;        # don't buffer — send each event immediately
    proxy_cache off;
    proxy_set_header Connection '';
    proxy_http_version 1.1;     # required for keep-alive streaming
    proxy_read_timeout 86400s;  # keep connection open 24h (SSE is long-lived)
}
```

**Q: "Why not serve static files from Node.js?"**
Node can serve static files with `express.static()` but it's not what Node is good at. Nginx is purpose-built for serving static assets — it's 10x faster, uses far less memory, and handles thousands of concurrent connections with almost no CPU.

---

## 3. Frontend — React + Vite

### Tech Choices

| Tool | Why |
|------|-----|
| **React 18** | Required by spec |
| **Vite** | Required by spec. Much faster than CRA — instant HMR, ES module dev server |
| **Tailwind CSS** | Utility-first, no context switching. Fast for hackathon UI |
| **TanStack Query** | Server state management. Handles caching, refetching, loading/error states. Much cleaner than raw `useEffect` for API calls |
| **Zustand** | Auth state (token + user). Tiny, persists to localStorage, no boilerplate |
| **React Router v6** | Client-side routing |
| **Axios** | HTTP client with interceptors — attaches JWT token to every request automatically |

### Key Patterns

**Auth flow:**
```
Login → POST /api/auth/login → JWT token + user
     → stored in Zustand (persisted to localStorage)
     → Axios interceptor attaches Bearer token to every request
     → 401 response → clears auth → redirects to /login
```

**Protected routes:** `ProtectedRoute` component checks Zustand for token. No token → redirect to `/login`. Wraps the entire authenticated section of the router.

**Real-time (SSE hook):**
```typescript
useSSE({
  'batch:status_changed': () => refetch(),
  'sla:breach': (data) => showAlert(data),
})
```
EventSource connects to `/api/events?token=...` (token in query param because EventSource API doesn't support custom headers). On event, React Query's `refetch()` updates the UI without a full page reload.

**Q: "Why TanStack Query and not Redux?"**
Redux is for app-wide UI state. TanStack Query is for server state — data that lives on the server and needs to be fetched, cached, and kept in sync. For this project, almost all state is server state (batches, approvals, certificates). TanStack Query handles loading/error/stale states and automatic refetching with almost no code.

---

## 4. Backend — Express + TypeScript

### Structure: Feature-Based, Not Layer-Based

```
src/features/
  auth/         → auth.router.ts + auth.service.ts + auth.schema.ts
  batches/      → batch.router.ts + batch.service.ts
  approvals/    → approval.router.ts + approval.service.ts   ← race condition here
  certificates/ → certificate.router.ts
  verify/       → verify.router.ts                           ← public, no auth
  sse/          → sse.router.ts
```

Layer-based (controllers/services/repositories all in separate folders) forces you to jump between files constantly. Feature-based keeps everything for one domain together.

### Request Lifecycle

```
Request → Helmet (security headers)
        → CORS
        → Rate limiter
        → authenticate middleware (verifies JWT)
        → authorize middleware (checks role)
        → validate middleware (Zod schema)
        → route handler
        → service (business logic)
        → Prisma (DB)
        → response

Error at any step → errorHandler middleware → structured JSON response
```

### Key Middleware

**authenticate.ts** — Verifies JWT, attaches `req.user` with `{userId, role, districtId}`. Supports token in `Authorization: Bearer` header OR `?token=` query param (needed for EventSource which can't send headers).

**authorize.ts** — `authorize('DISTRICT_OFFICER', 'STATE_OFFICE')` — rejects if `req.user.role` not in the list. Stateless, composable.

**validate.ts** — Wraps a Zod schema around `{body, query, params}`. Invalid input → 400 with per-field error messages. This is the "tampered requests cannot fool the system" requirement.

**error-handler.ts** — Global Express error middleware. Catches Zod errors (400), Prisma unique violations (409), AppError (operational, known status code), and anything else (500 — logs it, returns generic message, never leaks internals).

**Q: "How do you handle security?"**
- Helmet sets security headers (CSP, X-Frame-Options, etc.)
- JWT for stateless auth — no session storage needed
- Zod validates every input before it touches the DB
- Role + ownership checks in service layer
- Pre-signed URLs for PDFs (private storage, 15-min expiry)
- Rate limiting on all endpoints

---

## 5. Event-Driven Architecture — BullMQ

### Why Event-Driven At All?

The PDF had three scenarios that make synchronous processing impossible:

**Scenario 1: 60 candidates, final approval**
Synchronous: API approves → starts generating 60 PDFs + calling WhatsApp → HTTP request holds open for minutes → times out → half done, state unknown.
Event-driven: API approves → enqueues 60 jobs → responds in <100ms → workers process independently with retries.

**Scenario 2: WhatsApp is unreliable**
Synchronous: WhatsApp call fails → user gets error → did the cert get sent? Do we retry? Who tracks it?
Event-driven: job fails → automatic retry with exponential backoff → delivery status tracked in DB.

**Scenario 3: SLA watchdog**
No user action triggers "batch stuck for 24h". You need a background process on a schedule.
Event-driven: BullMQ repeatable job runs every 15 minutes, finds stale batches, pushes SSE alerts to state office.

### Why BullMQ Over RabbitMQ / Kafka?

| | BullMQ | RabbitMQ | Kafka |
|--|--------|----------|-------|
| Extra container | No (uses Redis) | Yes | Yes |
| Job deduplication | Built-in (jobId) | Manual | Manual |
| Retry + backoff | Built-in | Manual | Manual |
| Scheduled/cron jobs | Built-in | Plugin | No |
| Node.js native | Yes | No (AMQP) | No |
| Setup complexity | Low | Medium | High |

Redis was already required by the spec. BullMQ runs on Redis — zero extra infrastructure.

### The Three Queues

**`certificate:generation`**
- Triggered: state office approves a batch
- Does: generates PDF with PDFKit → uploads to LocalStack S3 → saves cert to DB → enqueues WhatsApp job
- Concurrency: 5 (5 PDFs in parallel per worker)
- Dedup key: `cert-gen-${candidateId}` — if approval fires twice, second job is a no-op

**`whatsapp:delivery`**
- Triggered: certificate generated
- Does: calls mock WhatsApp provider with pre-signed PDF URL
- Attempts: 5, exponential backoff (3s → 6s → 12s → 24s → 48s)
- Dedup key: `wa-deliver-${certificateId}` — prevents double-send on retry
- On final failure: marks delivery as FAILED in DB (observable)

**`sla:check`**
- Triggered: BullMQ repeatable job, every 15 minutes
- Does: finds batches where `updatedAt < now - SLA_limit` → creates BatchEvent audit log → pushes SSE alert to state office

### Exactly-Once Certificate Guarantee

Three layers preventing any candidate from getting two certificates:

1. **BullMQ jobId** — `cert-gen-${candidateId}` deduplication. If the approval event fires twice, only one job ever runs.
2. **Idempotency check in worker** — first thing the worker does: check if cert already exists for this candidate. If yes, skip.
3. **DB UNIQUE constraint** — `UNIQUE(candidateId)` on the certificates table. Even if both layers above fail, the second `INSERT` fails at the database level.

**Q: "What happens if a worker crashes mid-job?"**
BullMQ marks jobs as "active" when processing starts. If the worker dies, jobs stay "active". BullMQ moves stale active jobs back to the queue after a timeout. The worker's idempotency check ensures the work doesn't happen twice.

---

## 6. Database — PostgreSQL + Prisma

### Why PostgreSQL?

- **ACID transactions** — the race condition fix lives here
- **UNIQUE constraints** — the hard guarantee against duplicate certificates
- **Strong relations** — complex joins across batches, districts, approvals, certificates

### Schema Overview

```
districts ──< users ──< batches ──< candidates ──── certificates
                              │                           │
                              └──< batch_approvals        └──< whatsapp_deliveries
                              └──< batch_events (audit log — never deleted)
```

### Why Each Table Exists

**`districts`** — stores `requiredApprovals` per district. Configurable threshold without code changes.

**`batch_approvals`** — one row per officer vote. Separate table because district approval requires multiple officers. `UNIQUE(batchId, officerId, stage)` prevents double-voting at DB level.

**`certificates`** — `UNIQUE(candidateId)` is the core safety guarantee. `certificateNumber` is `PSM-2024-{10 random hex chars}` — non-sequential, ~1 trillion combinations, can't enumerate.

**`batch_events`** — append-only audit log. Every state transition writes a row. Never deleted. Satisfies "every decision traceable to who made it and when."

**`whatsapp_deliveries`** — tracks each delivery attempt. Stores `providerMessageId` to detect if provider accepted but we crashed before saving.

### The Race Condition Fix

```sql
BEGIN;
SELECT id, status FROM batches WHERE id = $batchId FOR UPDATE;  -- lock the row
INSERT INTO batch_approvals ...;                                  -- record vote
SELECT COUNT(*) FROM batch_approvals WHERE batch_id = $batchId AND stage = 'DISTRICT' AND action = 'APPROVED';
-- if count >= requiredApprovals → UPDATE batches SET status = 'STATE_REVIEW'
COMMIT;
```

T1 and T2 arrive simultaneously. T1 gets the lock, runs fully, commits. T2 waits, wakes up, re-counts, finds threshold already passed → does nothing. Batch advances exactly once.

---

## 7. Storage — LocalStack S3

### Why Object Storage and Not DB?

Postgres is for structured data. Binary PDF blobs in DB:
- Inflates DB size
- Every PDF download hits the DB
- No CDN support, backups become huge

### Why LocalStack Instead of MinIO?

Every MinIO Docker image variant requires registry login — breaks `docker-compose up` for anyone without an account. `localstack/localstack` pulls from Docker Hub with zero auth.

Same S3 API, same MinIO SDK, just port 4566 instead of 9000. In production: swap endpoint to real AWS S3.

### Pre-Signed URLs

PDFs stored in private bucket. Backend generates a time-limited URL (15-min expiry). After expiry → 403. The PDF never passes through the backend process — served directly from S3.

---

## 8. Real-Time — SSE vs WebSockets

All updates in this system are server → client only. SSE is sufficient and simpler:
- Built into every browser (`EventSource` API, no library needed)
- Works over plain HTTP
- Auto-reconnects on drop
- Nginx handles it with `proxy_buffering off`

WebSockets add bidirectional protocol complexity that this system doesn't need.

**Production scaling:** In-memory SSE store works for one API instance. For multiple instances: Redis pub/sub — each instance subscribes to a channel, forwards events to its local clients.

---

## 9. Certificate Verification

Non-sequential cert number embedded as QR + text in every PDF. Employer scans → hits `/verify/{number}` → DB lookup → shows real candidate data.

If someone edits the PDF name but keeps the QR → verify shows the real name → mismatch caught.
If someone invents a number → not found in DB → fake.

Redis cache: 10-second TTL. Cancel event immediately calls `redis.del(key)` → next lookup hits DB within seconds.

---

## 10. Questions You Should Be Ready For

**"Why not microservices?"**
> Microservices means 3 hours on service discovery instead of features. The API and worker are already decoupled through BullMQ queues — that's the event-driven boundary. Same codebase, different processes. In production you'd split the worker to its own ECS service scaled on queue depth. That's a natural evolution, not a rewrite.

**"What happens when the worker crashes?"**
> BullMQ marks jobs "active" when processing starts. If the worker dies, BullMQ moves stale active jobs back to the queue after a timeout. The idempotency check at the top of each worker ensures reprocessing is safe.

**"What happens if WhatsApp is down for an hour?"**
> Jobs stay in queue with exponential backoff (up to 5 attempts). If all fail, delivery is marked FAILED. The certificate is still valid and downloadable — only the notification failed.

**"How does the system scale to 500 batch approvals in an hour?"**
> Each approval enqueues N jobs. Workers process 5 PDFs in parallel. Scale with `--scale worker=10`. BullMQ distributes jobs across all instances automatically.

**"Why PostgreSQL and not MongoDB?"**
> Complex relational data with ACID requirements. The race condition fix needs `SELECT FOR UPDATE`. MongoDB transactions are more complex. PostgreSQL is the right tool for structured, relational, transactional data.

**"How do you know no one got two certificates?"**
> Three layers: BullMQ jobId dedup → worker idempotency check → DB UNIQUE(candidateId) constraint. The DB is the final arbiter regardless of what happens above it.
