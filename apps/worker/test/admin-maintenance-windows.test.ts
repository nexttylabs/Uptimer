import { describe, expect, it } from 'vitest';

import {
  createMaintenanceWindowInputSchema,
  patchMaintenanceWindowInputSchema,
} from '../src/schemas/maintenance-windows';

describe('admin maintenance status-page contract', () => {
  it('requires explicit status pages on create and permits explicit link replacement on patch', () => {
    const base = {
      title: 'Partner maintenance',
      starts_at: 100,
      ends_at: 200,
      monitor_ids: [7],
    };

    expect(createMaintenanceWindowInputSchema.safeParse(base).success).toBe(false);
    expect(
      createMaintenanceWindowInputSchema.safeParse({ ...base, status_page_ids: [4] }),
    ).toMatchObject({ success: true });
    expect(patchMaintenanceWindowInputSchema.safeParse({ status_page_ids: [4, 5] })).toMatchObject({
      success: true,
    });
  });
});
