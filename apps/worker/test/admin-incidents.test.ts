import { describe, expect, it } from 'vitest';

import { createIncidentInputSchema } from '../src/schemas/incidents';

describe('admin incident status-page contract', () => {
  it('requires at least one explicit status page while keeping monitor impact scope separate', () => {
    expect(
      createIncidentInputSchema.safeParse({
        title: 'Partner API outage',
        monitor_ids: [7],
      }).success,
    ).toBe(false);

    expect(
      createIncidentInputSchema.safeParse({
        title: 'Partner API outage',
        monitor_ids: [7],
        status_page_ids: [4],
      }),
    ).toMatchObject({ success: true });
  });
});
