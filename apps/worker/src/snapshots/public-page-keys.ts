const DEFAULT_STATUS_PAGE_ID = 1;

function assertStatusPageId(statusPageId: number): void {
  if (!Number.isInteger(statusPageId) || statusPageId <= 0) {
    throw new Error('status page id must be a positive integer');
  }
}

function withPageSuffix(legacyKey: string, statusPageId: number): string {
  assertStatusPageId(statusPageId);
  return statusPageId === DEFAULT_STATUS_PAGE_ID ? legacyKey : `${legacyKey}:page:${statusPageId}`;
}

export function publicStatusSnapshotKey(statusPageId = DEFAULT_STATUS_PAGE_ID): string {
  return withPageSuffix('status', statusPageId);
}

export function publicHomepageSnapshotKey(statusPageId = DEFAULT_STATUS_PAGE_ID): string {
  return withPageSuffix('homepage', statusPageId);
}

export function publicHomepageArtifactSnapshotKey(statusPageId = DEFAULT_STATUS_PAGE_ID): string {
  return withPageSuffix('homepage:artifact', statusPageId);
}

export function publicStatusMonitorFragmentsKey(statusPageId = DEFAULT_STATUS_PAGE_ID): string {
  return withPageSuffix('status:monitors', statusPageId);
}

export function publicHomepageMonitorFragmentsKey(statusPageId = DEFAULT_STATUS_PAGE_ID): string {
  return withPageSuffix('homepage:monitors', statusPageId);
}

export function publicMonitorRuntimeUpdateFragmentsKey(statusPageId = DEFAULT_STATUS_PAGE_ID): string {
  return withPageSuffix('monitor-runtime:updates', statusPageId);
}

export function publicHomepageArtifactMonitorFragmentsKey(statusPageId = DEFAULT_STATUS_PAGE_ID): string {
  return withPageSuffix('homepage:artifact:monitors', statusPageId);
}

export function publicHomepageGuardKey(statusPageId = DEFAULT_STATUS_PAGE_ID): string {
  return withPageSuffix('homepage:guard', statusPageId);
}
