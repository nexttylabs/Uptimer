export async function enqueueStatusPageRefreshes(
  db: D1Database,
  statusPageIds: number[],
  now: number,
  reason: string,
): Promise<void> {
  const ids = [...new Set(statusPageIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return;

  await db.batch(
    ids.map((statusPageId) =>
      db
        .prepare(
          `
            INSERT INTO status_page_refresh_queue (status_page_id, queued_at, reason)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(status_page_id) DO UPDATE SET
              queued_at = excluded.queued_at,
              reason = excluded.reason
          `,
        )
        .bind(statusPageId, now, reason),
    ),
  );
}

export async function listStatusPageRefreshes(
  db: D1Database,
  limit: number,
): Promise<number[]> {
  const boundedLimit = Math.max(1, Math.min(10, Math.floor(limit)));
  const { results } = await db
    .prepare(
      `
        SELECT status_page_id
        FROM status_page_refresh_queue
        ORDER BY queued_at, status_page_id
        LIMIT ?1
      `,
    )
    .bind(boundedLimit)
    .all<{ status_page_id: number }>();
  return (results ?? []).map((row) => row.status_page_id);
}

export async function acknowledgeStatusPageRefresh(
  db: D1Database,
  statusPageId: number,
): Promise<void> {
  await db
    .prepare('DELETE FROM status_page_refresh_queue WHERE status_page_id = ?1')
    .bind(statusPageId)
    .run();
}

export async function enqueueRefreshesForMonitor(
  db: D1Database,
  monitorId: number,
  now: number,
  reason: string,
): Promise<void> {
  const { results } = await db
    .prepare('SELECT status_page_id FROM status_page_monitors WHERE monitor_id = ?1')
    .bind(monitorId)
    .all<{ status_page_id: number }>();
  await enqueueStatusPageRefreshes(
    db,
    (results ?? []).map((row) => row.status_page_id),
    now,
    reason,
  );
}

export async function enqueueRefreshesForIncident(
  db: D1Database,
  incidentId: number,
  now: number,
  reason: string,
): Promise<void> {
  const { results } = await db
    .prepare('SELECT status_page_id FROM status_page_incidents WHERE incident_id = ?1')
    .bind(incidentId)
    .all<{ status_page_id: number }>();
  await enqueueStatusPageRefreshes(
    db,
    (results ?? []).map((row) => row.status_page_id),
    now,
    reason,
  );
}

export async function enqueueRefreshesForMaintenanceWindow(
  db: D1Database,
  maintenanceWindowId: number,
  now: number,
  reason: string,
): Promise<void> {
  const { results } = await db
    .prepare(
      'SELECT status_page_id FROM status_page_maintenance_windows WHERE maintenance_window_id = ?1',
    )
    .bind(maintenanceWindowId)
    .all<{ status_page_id: number }>();
  await enqueueStatusPageRefreshes(
    db,
    (results ?? []).map((row) => row.status_page_id),
    now,
    reason,
  );
}
