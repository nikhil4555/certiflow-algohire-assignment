/**
 * Mock WhatsApp provider.
 *
 * Mimics a real WhatsApp Business API — including random failures and timeouts.
 * This lets us test BullMQ retry logic without a real WhatsApp account.
 *
 * Config via env:
 *   FAILURE_RATE  — probability of returning a 500 error (default 0.3 = 30%)
 *   TIMEOUT_RATE  — probability of hanging until client times out (default 0.1 = 10%)
 */
import express from 'express'

const app = express()
app.use(express.json())

const PORT = parseInt(process.env.PORT ?? '4000', 10)
const FAILURE_RATE = parseFloat(process.env.FAILURE_RATE ?? '0.3')
const TIMEOUT_RATE = parseFloat(process.env.TIMEOUT_RATE ?? '0.1')

// In-memory log of sent messages (useful for debugging/demo)
const sentMessages: { messageId: string; phone: string; message: string; sentAt: string }[] = []

/** POST /send — send a WhatsApp message */
app.post('/send', async (req, res) => {
  const { phone, message, certificateNumber } = req.body

  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' })
  }

  const roll = Math.random()

  // Simulate timeout — hang until the caller's timeout fires
  if (roll < TIMEOUT_RATE) {
    console.log(`[mock-wa] TIMEOUT for ${phone} (cert: ${certificateNumber})`)
    await new Promise((resolve) => setTimeout(resolve, 60_000)) // hang for 60s
    return
  }

  // Simulate failure
  if (roll < TIMEOUT_RATE + FAILURE_RATE) {
    console.log(`[mock-wa] FAILURE for ${phone} (cert: ${certificateNumber})`)
    return res.status(503).json({ error: 'WhatsApp service temporarily unavailable' })
  }

  // Simulate processing delay (100-500ms)
  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 400))

  const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const record = { messageId, phone, message, sentAt: new Date().toISOString() }
  sentMessages.push(record)

  console.log(`[mock-wa] SENT to ${phone} | cert: ${certificateNumber} | id: ${messageId}`)

  res.json({ success: true, messageId })
})

/** GET /messages — view all sent messages (for demo/debugging) */
app.get('/messages', (_req, res) => {
  res.json({ count: sentMessages.length, messages: sentMessages.slice(-50) })
})

/** GET /health */
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => {
  console.log(`Mock WhatsApp running on port ${PORT}`)
  console.log(`  Failure rate: ${(FAILURE_RATE * 100).toFixed(0)}%`)
  console.log(`  Timeout rate: ${(TIMEOUT_RATE * 100).toFixed(0)}%`)
})
