import { describe, expect, it } from 'vitest';

import {
  statusPageIncidents,
  statusPageMaintenanceWindows,
  statusPageMonitors,
  statusPages,
} from '@uptimer/db';

describe('status page Drizzle schema', () => {
  it('maps the status page publication tables and page-local monitor presentation fields', () => {
    expect(statusPages.id.name).toBe('id');
    expect(statusPages.slug.name).toBe('slug');
    expect(statusPages.isPublic.name).toBe('is_public');
    expect(statusPages.customHostname?.name).toBe('custom_hostname');

    expect(statusPageMonitors.statusPageId.name).toBe('status_page_id');
    expect(statusPageMonitors.monitorId.name).toBe('monitor_id');
    expect(statusPageMonitors.groupName.name).toBe('group_name');
    expect(statusPageMonitors.groupSortOrder.name).toBe('group_sort_order');
    expect(statusPageMonitors.sortOrder.name).toBe('sort_order');

    expect(statusPageIncidents.statusPageId.name).toBe('status_page_id');
    expect(statusPageIncidents.incidentId.name).toBe('incident_id');
    expect(statusPageMaintenanceWindows.statusPageId.name).toBe('status_page_id');
    expect(statusPageMaintenanceWindows.maintenanceWindowId.name).toBe('maintenance_window_id');
  });
});
