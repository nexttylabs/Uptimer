-- Page-qualified snapshot refresh queue. IDs only; payload remains in existing snapshot tables.
CREATE TABLE IF NOT EXISTS status_page_refresh_queue (
  status_page_id INTEGER PRIMARY KEY,
  queued_at INTEGER NOT NULL,
  reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_status_page_refresh_queue_queued_at
  ON status_page_refresh_queue (queued_at, status_page_id);
