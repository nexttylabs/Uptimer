import { describe, expect, it } from 'vitest';

import {
  publicHomepageArtifactMonitorFragmentsKey,
  publicHomepageArtifactSnapshotKey,
  publicHomepageGuardKey,
  publicHomepageMonitorFragmentsKey,
  publicHomepageSnapshotKey,
  publicMonitorRuntimeUpdateFragmentsKey,
  publicStatusMonitorFragmentsKey,
  publicStatusSnapshotKey,
} from '../src/snapshots/public-page-keys';

describe('public page snapshot keys', () => {
  it('keeps default-page keys compatible and isolates every non-default page', () => {
    expect(publicStatusSnapshotKey()).toBe('status');
    expect(publicHomepageSnapshotKey()).toBe('homepage');
    expect(publicHomepageArtifactSnapshotKey()).toBe('homepage:artifact');

    const pageTwoKeys = [
      publicStatusSnapshotKey(2),
      publicHomepageSnapshotKey(2),
      publicHomepageArtifactSnapshotKey(2),
      publicStatusMonitorFragmentsKey(2),
      publicHomepageMonitorFragmentsKey(2),
      publicMonitorRuntimeUpdateFragmentsKey(2),
      publicHomepageArtifactMonitorFragmentsKey(2),
      publicHomepageGuardKey(2),
    ];
    const pageThreeKeys = [
      publicStatusSnapshotKey(3),
      publicHomepageSnapshotKey(3),
      publicHomepageArtifactSnapshotKey(3),
      publicStatusMonitorFragmentsKey(3),
      publicHomepageMonitorFragmentsKey(3),
      publicMonitorRuntimeUpdateFragmentsKey(3),
      publicHomepageArtifactMonitorFragmentsKey(3),
      publicHomepageGuardKey(3),
    ];

    expect(new Set(pageTwoKeys).size).toBe(pageTwoKeys.length);
    expect(pageThreeKeys).not.toEqual(pageTwoKeys);
  });
});
