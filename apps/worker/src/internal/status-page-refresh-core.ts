import type { Env } from '../env';
import { computePublicStatusPayload } from '../public/status';
import { writePageStatusSnapshot } from '../snapshots/public-status';
import {
  acknowledgeStatusPageRefresh,
  listStatusPageRefreshes,
} from '../snapshots/status-page-refresh-queue';

export async function refreshQueuedStatusPageSnapshots(opts: {
  env: Env;
  now: number;
  limit: number;
}): Promise<{ refreshedPageIds: number[]; hasMore: boolean }> {
  try {
    const statusPageIds = await listStatusPageRefreshes(opts.env.DB, opts.limit);
    const refreshedPageIds: number[] = [];

    for (const statusPageId of statusPageIds) {
      const payload = await computePublicStatusPayload(opts.env.DB, opts.now, { statusPageId });
      await writePageStatusSnapshot(opts.env.DB, opts.now, statusPageId, payload);
      await acknowledgeStatusPageRefresh(opts.env.DB, statusPageId);
      refreshedPageIds.push(statusPageId);
    }

    return { refreshedPageIds, hasMore: statusPageIds.length === opts.limit };
  } catch (err) {
    console.warn('status page refresh queue consumption failed', err);
    return { refreshedPageIds: [], hasMore: false };
  }
}
