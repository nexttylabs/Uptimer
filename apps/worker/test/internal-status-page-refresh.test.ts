import { describe, expect, it } from 'vitest';

import { refreshQueuedStatusPageSnapshots } from '../src/internal/status-page-refresh-core';
import { createFakeD1Database } from './helpers/fake-d1';

describe('internal status page refresh', () => {
  it('acknowledges a page only after its qualified snapshot is written', async () => {
    const operations: string[] = [];
    const db = createFakeD1Database([
      { match: 'from status_page_refresh_queue', all: () => [{ status_page_id: 4 }] },
      { match: 'from monitors m', all: () => [] },
      { match: 'from incidents', all: () => [] },
      { match: 'from maintenance_windows', all: () => [] },
      { match: 'select value from settings', first: () => ({ value: '3' }) },
      { match: 'select key, value from settings', all: () => [] },
      {
        match: 'insert into public_snapshots',
        run: (args) => {
          operations.push(`write:${args[0]}`);
          return { success: true, meta: { changes: 1 } };
        },
      },
      {
        match: 'delete from status_page_refresh_queue',
        run: () => {
          operations.push('ack:4');
          return { success: true, meta: { changes: 1 } };
        },
      },
    ]);

    const result = await refreshQueuedStatusPageSnapshots({
      env: { DB: db } as never,
      now: 100,
      limit: 5,
    });

    expect(result).toEqual({ refreshedPageIds: [4], hasMore: false });
    expect(operations).toEqual(['write:status:page:4', 'ack:4']);
  });
});
