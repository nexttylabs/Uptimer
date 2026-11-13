import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type { Env } from '../src/env';
import { handleError, handleNotFound } from '../src/middleware/errors';
import {
  homepageFromStatusPayload,
  tryComputePublicHomepagePayloadFromScheduledRuntimeUpdates,
} from '../src/public/homepage';
import {
  readHomepageGuardCacheState,
  writeHomepageGuardCacheState,
} from '../src/public/homepage-guard-state';
import {
  resolveAccessibleStatusPage,
  resolveAccessibleStatusPageById,
  resolvePublicStatusPage,
  resolvePublicStatusPageByHostname,
  resolvePublicStatusPageById,
} from '../src/public/status-page';
import { tryComputePublicStatusPayloadFromScheduledRuntimeUpdates } from '../src/public/status-refresh';
import { publicRoutes } from '../src/routes/public';
import {
  storedPublicHomepageResponseSchema as zodStoredPublicHomepageResponseSchema,
  type PublicHomepageResponse,
} from '../src/schemas/public-homepage';
import { storedPublicHomepageResponseSchema as fastStoredPublicHomepageResponseSchema } from '../src/schemas/public-homepage-stored';
import {
  storedPublicStatusResponseSchema as zodStoredPublicStatusResponseSchema,
  type PublicStatusResponse,
} from '../src/schemas/public-status';
import { storedPublicStatusResponseSchema as fastStoredPublicStatusResponseSchema } from '../src/schemas/public-status-stored';
import { DEFAULT_STATUS_PAGE_THEME_CONFIG } from '../src/schemas/status-pages';
import { readHomepageRefreshBaseSnapshot } from '../src/snapshots/public-homepage-read';
import { readStatusSnapshotPayloadAnyAge } from '../src/snapshots/public-status-read';
import { createFakeD1Database } from './helpers/fake-d1';

const ALPHA_THEME = {
  custom_css: '.alpha-banner { color: #111827; }',
  footer_hidden: false,
  footer_text: 'Alpha Status Footer',
};

const BETA_THEME = {
  custom_css: '.beta-banner { color: #2563eb; }',
  footer_hidden: true,
  footer_text: null,
};

function makeBaseStatusPayload(now: number, overrides: Partial<PublicStatusResponse> = {}): PublicStatusResponse {
  const dayStartAt = Math.floor(now / 86_400) * 86_400;
  return {
    generated_at: now - 30,
    site_title: 'Alpha Status',
    site_description: 'Alpha services',
    logo_url: null,
    theme_config: ALPHA_THEME,
    site_locale: 'en',
    site_timezone: 'UTC',
    uptime_rating_level: 4,
    overall_status: 'up',
    banner: {
      source: 'monitors',
      status: 'operational',
      title: 'All Systems Operational',
      down_ratio: null,
    },
    summary: { up: 1, down: 0, maintenance: 0, paused: 0, unknown: 0 },
    monitors: [
      {
        id: 1,
        name: 'API',
        type: 'http',
        display_url: null,
        group_name: 'Core',
        group_sort_order: 0,
        sort_order: 0,
        uptime_rating_level: 4,
        status: 'up',
        is_stale: false,
        last_checked_at: now - 30,
        last_latency_ms: 42,
        heartbeats: [{ checked_at: now - 30, status: 'up', latency_ms: 42 }],
        uptime_30d: {
          range_start_at: dayStartAt - 29 * 86_400,
          range_end_at: dayStartAt + 86_400,
          total_sec: 86_400,
          downtime_sec: 0,
          unknown_sec: 0,
          uptime_sec: 86_400,
          uptime_pct: 100,
        },
        uptime_days: [
          {
            day_start_at: dayStartAt,
            total_sec: 86_400,
            downtime_sec: 0,
            unknown_sec: 0,
            uptime_sec: 86_400,
            uptime_pct: 100,
          },
        ],
      },
    ],
    active_incidents: [],
    maintenance_windows: { active: [], upcoming: [] },
    ...overrides,
  };
}

function makeBaseHomepagePayload(now: number, overrides: Partial<PublicHomepageResponse> = {}): PublicHomepageResponse {
  const dayStartAt = Math.floor(now / 86_400) * 86_400;
  return {
    generated_at: now - 30,
    bootstrap_mode: 'full',
    monitor_count_total: 1,
    site_title: 'Alpha Status',
    site_description: 'Alpha services',
    logo_url: null,
    theme_config: ALPHA_THEME,
    site_locale: 'en',
    site_timezone: 'UTC',
    uptime_rating_level: 4,
    overall_status: 'up',
    banner: {
      source: 'monitors',
      status: 'operational',
      title: 'All Systems Operational',
      down_ratio: null,
    },
    summary: { up: 1, down: 0, maintenance: 0, paused: 0, unknown: 0 },
    monitors: [
      {
        id: 1,
        name: 'API',
        type: 'http',
        display_url: null,
        group_name: 'Core',
        status: 'up',
        is_stale: false,
        last_checked_at: now - 30,
        heartbeat_strip: {
          checked_at: [now - 30],
          status_codes: 'u',
          latency_ms: [42],
        },
        uptime_30d: { uptime_pct: 100 },
        uptime_day_strip: {
          day_start_at: [dayStartAt],
          downtime_sec: [0],
          unknown_sec: [0],
          uptime_pct_milli: [100_000],
        },
      },
    ],
    active_incidents: [],
    maintenance_windows: { active: [], upcoming: [] },
    resolved_incident_preview: null,
    maintenance_history_preview: null,
    ...overrides,
  };
}

describe('status page theme_config public resolvers, snapshots, and fast guards (A2)', () => {
  it('isolates alpha and beta theme_config across all 5 resolvers and safely falls back on corrupt DB JSON', async () => {
    const pages = [
      {
        id: 1,
        slug: 'alpha',
        name: 'Alpha',
        title: 'Alpha Status',
        description: '',
        custom_hostname: 'alpha.example.com',
        logo_url: null,
        theme_config_json: JSON.stringify(ALPHA_THEME),
        is_public: 1,
      },
      {
        id: 2,
        slug: 'beta',
        name: 'Beta',
        title: 'Beta Status',
        description: '',
        custom_hostname: 'beta.example.com',
        logo_url: null,
        theme_config_json: JSON.stringify(BETA_THEME),
        is_public: 1,
      },
      {
        id: 3,
        slug: 'corrupt',
        name: 'Corrupt',
        title: 'Corrupt Status',
        description: '',
        custom_hostname: 'corrupt.example.com',
        logo_url: null,
        theme_config_json: '{bad-json',
        is_public: 1,
      },
    ];

    const db = createFakeD1Database([
      {
        match: 'from status_pages where slug = ?1 and is_public = 1',
        first: (args) => pages.find((p) => p.slug === args[0] && p.is_public === 1) ?? null,
      },
      {
        match: 'from status_pages where slug = ?1',
        first: (args) => pages.find((p) => p.slug === args[0]) ?? null,
      },
      {
        match: 'from status_pages where id = ?1 and is_public = 1',
        first: (args) => pages.find((p) => p.id === args[0] && p.is_public === 1) ?? null,
      },
      {
        match: 'from status_pages where id = ?1',
        first: (args) => pages.find((p) => p.id === args[0]) ?? null,
      },
      {
        match: 'from status_pages where custom_hostname = ?1 and is_public = 1',
        first: (args) => pages.find((p) => p.custom_hostname === args[0] && p.is_public === 1) ?? null,
      },
    ]);

    expect((await resolvePublicStatusPage(db, 'alpha')).theme_config).toEqual(ALPHA_THEME);
    expect((await resolvePublicStatusPage(db, 'beta')).theme_config).toEqual(BETA_THEME);
    expect((await resolveAccessibleStatusPage(db, 'alpha', false)).theme_config).toEqual(ALPHA_THEME);
    expect((await resolveAccessibleStatusPageById(db, 2, false)).theme_config).toEqual(BETA_THEME);
    expect((await resolvePublicStatusPageById(db, 1)).theme_config).toEqual(ALPHA_THEME);
    expect((await resolvePublicStatusPageByHostname(db, 'beta.example.com')).theme_config).toEqual(
      BETA_THEME,
    );
    expect((await resolvePublicStatusPage(db, 'corrupt')).theme_config).toEqual(
      DEFAULT_STATUS_PAGE_THEME_CONFIG,
    );
  });

  it('serves isolated theme_config on /api/v1/public/status-pages/:slug/status and copies it in homepageFromStatusPayload', async () => {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: vi.fn(async () => ({ match: async () => undefined, put: async () => undefined })) },
    });
    const now = 1_750_000_000;
    const alphaSnapshot = makeBaseStatusPayload(now, { theme_config: ALPHA_THEME });
    const betaSnapshot = makeBaseStatusPayload(now, {
      site_title: 'Beta Status',
      theme_config: BETA_THEME,
    });

    const db = createFakeD1Database([
      {
        match: 'from status_pages where slug = ?1',
        first: (args) =>
          args[0] === 'alpha'
            ? {
                id: 10,
                slug: 'alpha',
                name: 'Alpha',
                title: 'Alpha Status',
                description: '',
                custom_hostname: null,
                logo_url: null,
                theme_config_json: JSON.stringify(ALPHA_THEME),
                is_public: 1,
              }
            : {
                id: 11,
                slug: 'beta',
                name: 'Beta',
                title: 'Beta Status',
                description: '',
                custom_hostname: null,
                logo_url: null,
                theme_config_json: JSON.stringify(BETA_THEME),
                is_public: 1,
              },
      },
      {
        match: 'select generated_at, updated_at from public_snapshots where key = ?1',
        first: () => ({ generated_at: Math.floor(Date.now() / 1000) - 5, updated_at: Math.floor(Date.now() / 1000) - 5 }),
      },
      {
        match: 'select generated_at, updated_at, body_json from public_snapshots where key = ?1',
        first: (args) => ({
          generated_at: Math.floor(Date.now() / 1000) - 5,
          updated_at: Math.floor(Date.now() / 1000) - 5,
          body_json: JSON.stringify(
            args[0] === 'status:page:10' ? alphaSnapshot : betaSnapshot,
          ),
        }),
      },
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.notFound(handleNotFound);
    app.route('/api/v1/public', publicRoutes);

    const bindings = { DB: db, ADMIN_TOKEN: 'secret' } as unknown as Env;
    const execCtx = { waitUntil: vi.fn() } as unknown as ExecutionContext;

    const alphaRes = await app.fetch(
      new Request('https://status.example.test/api/v1/public/status-pages/alpha/status'),
      bindings,
      execCtx,
    );
    expect(alphaRes.status).toBe(200);
    await expect(alphaRes.json()).resolves.toMatchObject({
      theme_config: ALPHA_THEME,
      status_page: { slug: 'alpha', theme_config: ALPHA_THEME },
    });

    const betaRes = await app.fetch(
      new Request('https://status.example.test/api/v1/public/status-pages/beta/status'),
      bindings,
      execCtx,
    );
    expect(betaRes.status).toBe(200);
    await expect(betaRes.json()).resolves.toMatchObject({
      theme_config: BETA_THEME,
      status_page: { slug: 'beta', theme_config: BETA_THEME },
    });

    expect(homepageFromStatusPayload(alphaSnapshot).theme_config).toEqual(ALPHA_THEME);
  });

  it('invalidates status, homepage, and homepage-guard-state fast guards on theme_config_json-only edits', async () => {
    const now = 1_750_000_000;
    const baseStatus = makeBaseStatusPayload(now, { theme_config: ALPHA_THEME });
    const baseHomepage = makeBaseHomepagePayload(now, { theme_config: ALPHA_THEME });

    const changedThemeJson = JSON.stringify({
      custom_css: '.changed { color: green; }',
      footer_hidden: false,
      footer_text: 'Alpha Status Footer',
    });

    const statusDb = createFakeD1Database([
      {
        match: 'from status_pages',
        first: () => ({
          site_title_value: baseStatus.site_title,
          site_description_value: baseStatus.site_description,
          logo_url_value: baseStatus.logo_url,
          theme_config_json_value: changedThemeJson,
          site_locale_value: baseStatus.site_locale,
          site_timezone_value: baseStatus.site_timezone,
          uptime_rating_level_value: String(baseStatus.uptime_rating_level),
          monitor_count_total: 1,
          max_updated_at: now - 120,
          has_active_incidents: 0,
          has_active_maintenance: 0,
          has_upcoming_maintenance: 0,
        }),
      },
    ]);

    const statusFastResult = await tryComputePublicStatusPayloadFromScheduledRuntimeUpdates({
      db: statusDb,
      now,
      baseSnapshot: baseStatus,
      runtimeSnapshot: {
        generated_at: now,
        monitors: [{ id: 1, last_checked_at: now, status: 'up', latency_ms: 42 }],
      },
    });
    expect(statusFastResult).toBeNull();

    const homepageDb = createFakeD1Database([
      {
        match: 'from status_pages',
        first: () => ({
          site_title_value: baseHomepage.site_title,
          site_description_value: baseHomepage.site_description,
          logo_url_value: baseHomepage.logo_url,
          theme_config_json_value: changedThemeJson,
          site_locale_value: baseHomepage.site_locale,
          site_timezone_value: baseHomepage.site_timezone,
          uptime_rating_level_value: String(baseHomepage.uptime_rating_level),
          monitor_count_total: 1,
          max_updated_at: now - 120,
          has_active_incidents: 0,
          has_resolved_incident_preview: 0,
          has_active_maintenance: 0,
          has_upcoming_maintenance: 0,
          has_maintenance_history_preview: 0,
        }),
      },
    ]);

    const homepageFastResult = await tryComputePublicHomepagePayloadFromScheduledRuntimeUpdates({
      db: homepageDb,
      now,
      baseSnapshot: baseHomepage,
      runtimeSnapshot: {
        generated_at: now,
        monitors: [{ id: 1, last_checked_at: now, status: 'up', latency_ms: 42 }],
      },
    });
    expect(homepageFastResult).toBeNull();

    // Verify homepage-guard-state round-trips theme_config cleanly.
    const versions = { settings: 1, monitorMetadata: 1, incidents: 1, maintenance: 1 };
    let storedGuardJson: string | null = null;
    const guardDb = createFakeD1Database([
      {
        match: 'insert into public_snapshot_guard_versions',
        run: (args) => {
          storedGuardJson = String(args[3]);
          return 1;
        },
      },
      {
        match: 'from public_snapshot_guard_versions',
        all: () => [
          { key: 'homepage:settings', version: versions.settings, state_json: null },
          { key: 'homepage:monitor-metadata', version: versions.monitorMetadata, state_json: null },
          { key: 'homepage:incidents', version: versions.incidents, state_json: null },
          { key: 'homepage:maintenance', version: versions.maintenance, state_json: null },
          { key: 'homepage:guard', version: 1, state_json: storedGuardJson },
        ],
      },
    ]);

    await writeHomepageGuardCacheState({
      db: guardDb,
      now,
      validUntil: now + 60,
      versions,
      state: {
        settings: {
          site_title: 'Alpha Status',
          site_description: '',
          logo_url: null,
          theme_config: ALPHA_THEME,
          site_locale: 'en',
          site_timezone: 'UTC',
          retention_check_results_days: 7,
          state_failures_to_down_from_up: 2,
          state_successes_to_up_from_down: 2,
          admin_default_overview_range: '24h',
          admin_default_monitor_range: '24h',
          uptime_rating_level: 4,
        },
        monitorMetadataStamp: { monitorCountTotal: 1, maxUpdatedAt: now - 120 },
        hasActiveIncidents: false,
        hasActiveMaintenance: false,
        hasUpcomingMaintenance: false,
        hasResolvedIncidentPreview: false,
        hasMaintenanceHistoryPreview: false,
      },
    });

    const cachedGuard = await readHomepageGuardCacheState(guardDb, now);
    expect(cachedGuard.source).toBe('db_cache');
    if (cachedGuard.source === 'db_cache') {
      expect(cachedGuard.state.settings.theme_config).toEqual(ALPHA_THEME);
    }
  });

  it('materializes default theme_config for pre-deploy stored snapshots and rejects malformed theme_config', async () => {
    const now = 1_750_000_000;
    const preDeployStatus: Record<string, unknown> = { ...makeBaseStatusPayload(now) };
    delete preDeployStatus.theme_config;

    const preDeployHomepage: Record<string, unknown> = { ...makeBaseHomepagePayload(now) };
    delete preDeployHomepage.theme_config;

    expect(zodStoredPublicStatusResponseSchema.parse(preDeployStatus).theme_config).toEqual(
      DEFAULT_STATUS_PAGE_THEME_CONFIG,
    );
    expect(zodStoredPublicHomepageResponseSchema.parse(preDeployHomepage).theme_config).toEqual(
      DEFAULT_STATUS_PAGE_THEME_CONFIG,
    );
    expect(fastStoredPublicStatusResponseSchema.safeParse(preDeployStatus).success).toBe(true);
    expect(fastStoredPublicHomepageResponseSchema.safeParse(preDeployHomepage).success).toBe(true);

    const snapshotDb = createFakeD1Database([
      {
        match: 'select generated_at, updated_at from public_snapshots where key = ?1',
        first: () => ({ generated_at: now - 30, updated_at: now - 30 }),
      },
      {
        match: 'select generated_at, updated_at, body_json from public_snapshots where key = ?1',
        first: (args) => ({
          generated_at: now - 30,
          updated_at: now - 30,
          body_json: JSON.stringify(
            args[0] === 'homepage' ? { version: 3, data: preDeployHomepage } : preDeployStatus,
          ),
        }),
      },
      {
        match: 'select key, generated_at, updated_at from public_snapshots',
        all: () => [{ key: 'homepage', generated_at: now - 30, updated_at: now - 30 }],
      },
    ]);

    const readStatus = await readStatusSnapshotPayloadAnyAge(snapshotDb, now);
    expect(readStatus?.data.theme_config).toEqual(DEFAULT_STATUS_PAGE_THEME_CONFIG);

    const readHomepage = await readHomepageRefreshBaseSnapshot(snapshotDb, now);
    expect(readHomepage.snapshot?.theme_config).toEqual(DEFAULT_STATUS_PAGE_THEME_CONFIG);

    for (const badThemeConfig of [
      'bad',
      { custom_css: null, footer_hidden: 'yes', footer_text: null },
      { custom_css: 123, footer_hidden: false, footer_text: null },
    ]) {
      expect(
        fastStoredPublicStatusResponseSchema.safeParse({
          ...preDeployStatus,
          theme_config: badThemeConfig,
        }).success,
      ).toBe(false);
      expect(
        fastStoredPublicHomepageResponseSchema.safeParse({
          ...preDeployHomepage,
          theme_config: badThemeConfig,
        }).success,
      ).toBe(false);
    }
  });
});
