-- Status-page custom hostname: one manually provisioned binding per public page.
-- Cloudflare owns DNS / Pages domain association / TLS; Uptimer owns only the
-- canonical hostname string and request routing. Keep this file append-only.
-- Future schema changes must be new migrations.

ALTER TABLE status_pages ADD COLUMN custom_hostname TEXT;

-- ponytail: partial unique index keeps NULL bindings free (multiple pages may
-- have no custom hostname) while enforcing global uniqueness for non-null ones.
CREATE UNIQUE INDEX IF NOT EXISTS uq_status_pages_custom_hostname
  ON status_pages (custom_hostname)
  WHERE custom_hostname IS NOT NULL;
