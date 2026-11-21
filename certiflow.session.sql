-- SELECT  * from batch_approvals;
-- See all batches and their status
SELECT id, status, candidate_count, created_at FROM batches ORDER BY created_at DESC;

-- Full audit trail for a batch
SELECT event_type, actor_id, metadata, created_at
FROM batch_events
ORDER BY created_at DESC;

-- Check certificates issued
SELECT certificate_number, status, issued_at
FROM certificates;

-- WhatsApp delivery status
SELECT c.certificate_number, w.status, w.attempts
FROM whatsapp_deliveries w
JOIN certificates c ON c.id = w.certificate_id;


select * from users

SELECT b.id, b.status, d.name as district
FROM batches b
JOIN districts d ON d.id = b.district_id
ORDER BY b.created_at DESC LIMIT 5;
