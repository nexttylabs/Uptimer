import { describe, expect, it } from 'vitest';

import {
  enqueueRefreshesForMonitor,
  enqueueStatusPageRefreshes,
  acknowledgeStatusPageRefresh,
  listStatusPageRefreshes,
} from '../src/snapshots/status-page-refresh-queue';
import { createFakeD1Database } from './helpers/fake-d1';

describe('status page refresh queue', () => {
  it('enqueues every page that contains a shared monitor', async () => {
    const writes: unknown[][] = [];
    const db = createFakeD1Database([
      {
        match: 'from status_page_monitors',
        all: () => [{ status_page_id: 2 }, { status_page_id: 3 }],
      },
      {
        match: 'insert into status_page_refresh_queue',
        run: (args) => {
          writes.push(args);
          return { success: true, meta: { changes: 1 } };
        },
      },
    ]);

    await enqueueRefreshesForMonitor(db, 9, 100, 'runtime-update');

    expect(writes).toEqual([
      [2, 100, 'runtime-update'],
      [3, 100, 'runtime-update'],
    ]);
  });

  it('lists a bounded page batch and only removes acknowledged pages', async () => {
    const deleted: unknown[][] = [];
    const db = createFakeD1Database([
      {
        match: 'from status_page_refresh_queue',
        all: (args) => {
          expect(args).toEqual([2]);
          return [{ status_page_id: 2 }, { status_page_id: 3 }];
        },
      },
      {
        match: 'delete from status_page_refresh_queue',
        run: (args) => {
          deleted.push(args);
          return { success: true, meta: { changes: 1 } };
        },
      },
    ]);

    await expect(listStatusPageRefreshes(db, 2)).resolves.toEqual([2, 3]);
    expect(deleted).toEqual([]);
    await acknowledgeStatusPageRefresh(db, 2);
    expect(deleted).toEqual([[2]]);
  });

  it('deduplicates page IDs before writing the queue', async () => {
    const writes: unknown[][] = [];
    const db = createFakeD1Database([
      {
        match: 'insert into status_page_refresh_queue',
        run: (args) => {
          writes.push(args);
          return { success: true, meta: { changes: 1 } };
        },
      },
    ]);

    await enqueueStatusPageRefreshes(db, [2, 2, 3], 100, 'page-links');

    expect(writes).toEqual([
      [2, 100, 'page-links'],
      [3, 100, 'page-links'],
    ]);
  });
});
