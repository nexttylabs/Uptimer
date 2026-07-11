-- Multi-public status pages: explicit publication boundaries.
-- NOTE: Keep this file append-only. Future schema changes must be new migrations.

CREATE TABLE IF NOT EXISTS status_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  theme_config_json TEXT,
  is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_status_pages_slug
  ON status_pages (slug);

CREATE TABLE IF NOT EXISTS status_page_monitors (
  status_page_id INTEGER NOT NULL,
  monitor_id INTEGER NOT NULL,
  group_name TEXT,
  group_sort_order INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
  PRIMARY KEY (status_page_id, monitor_id)
);
CREATE INDEX IF NOT EXISTS idx_status_page_monitors_monitor
  ON status_page_monitors (monitor_id);
CREATE INDEX IF NOT EXISTS idx_status_page_monitors_page_sort
  ON status_page_monitors (status_page_id, group_sort_order, group_name, sort_order, monitor_id);

CREATE TABLE IF NOT EXISTS status_page_incidents (
  status_page_id INTEGER NOT NULL,
  incident_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
  PRIMARY KEY (status_page_id, incident_id)
);
CREATE INDEX IF NOT EXISTS idx_status_page_incidents_incident
  ON status_page_incidents (incident_id);

CREATE TABLE IF NOT EXISTS status_page_maintenance_windows (
  status_page_id INTEGER NOT NULL,
  maintenance_window_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
  PRIMARY KEY (status_page_id, maintenance_window_id)
);
CREATE INDEX IF NOT EXISTS idx_status_page_maintenance_windows_window
  ON status_page_maintenance_windows (maintenance_window_id);

-- ponytail: preserve the existing single public-page audience as a default page.
INSERT OR IGNORE INTO status_pages (slug, name, title, description)
VALUES ('default', 'Default status page', 'Uptimer', '');

INSERT OR IGNORE INTO status_page_monitors (
  status_page_id,
  monitor_id,
  group_name,
  group_sort_order,
  sort_order
)
SELECT
  status_pages.id,
  monitors.id,
  monitors.group_name,
  monitors.group_sort_order,
  monitors.sort_order
FROM status_pages
JOIN monitors
WHERE status_pages.slug = 'default'
  AND monitors.show_on_status_page = 1;
