import type { PublicStatusResponse } from '../schemas/public-status';

import {
  buildPublicMonitorCards,
  buildPublicStatusBanner,
  incidentRowToApi,
  listIncidentUpdatesByIncidentId,
  readVisibleActiveIncidentSummary,
  listVisibleMaintenanceWindows,
  maintenanceWindowRowToApi,
  readPublicSiteSettings,
} from './data';

export async function computePublicStatusPayload(
  db: D1Database,
  now: number,
  opts: { includeHiddenMonitors?: boolean; statusPageId?: number } = {},
): Promise<PublicStatusResponse> {
  const includeHiddenMonitors = opts.includeHiddenMonitors ?? false;
  const statusPageId = opts.statusPageId;

  const [monitorData, activeIncidentSummary, maintenanceWindows, settings] = await Promise.all([
    buildPublicMonitorCards(db, now, {
      includeHiddenMonitors,
      ...(statusPageId === undefined ? {} : { statusPageId }),
    }),
    readVisibleActiveIncidentSummary(db, includeHiddenMonitors, statusPageId),
    listVisibleMaintenanceWindows(db, now, includeHiddenMonitors, statusPageId),
    readPublicSiteSettings(db),
  ]);
  const activeIncidents = activeIncidentSummary.items;

  const incidentUpdatesByIncidentId = await listIncidentUpdatesByIncidentId(
    db,
    activeIncidents.map((entry) => entry.row.id),
  );

  return {
    generated_at: now,
    site_title: settings.site_title,
    site_description: settings.site_description,
    site_locale: settings.site_locale,
    site_timezone: settings.site_timezone,
    uptime_rating_level: monitorData.uptimeRatingLevel,
    overall_status: monitorData.overallStatus,
    banner: buildPublicStatusBanner({
      counts: monitorData.summary,
      monitorCount: monitorData.monitors.length,
      activeIncidents,
      activeMaintenanceWindows: maintenanceWindows.active,
      bannerIncident: activeIncidentSummary.bannerIncident,
    }),
    summary: monitorData.summary,
    monitors: monitorData.monitors,
    active_incidents: activeIncidents.map(({ row, monitorIds }) =>
      incidentRowToApi(row, incidentUpdatesByIncidentId.get(row.id) ?? [], monitorIds),
    ),
    maintenance_windows: {
      active: maintenanceWindows.active.map(({ row, monitorIds }) =>
        maintenanceWindowRowToApi(row, monitorIds),
      ),
      upcoming: maintenanceWindows.upcoming.map(({ row, monitorIds }) =>
        maintenanceWindowRowToApi(row, monitorIds),
      ),
    },
  };
}
