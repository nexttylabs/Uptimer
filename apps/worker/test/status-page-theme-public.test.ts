import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type { Env } from '../src/env';
import { handleError, handleNotFound } from '../src/middleware/errors';
import { publicRoutes } from '../src/routes/public';
import {
  resolveAccessibleStatusPage,
  resolveAccessibleStatusPageById,
  resolvePublicStatusPage,
  resolvePublicStatusPageByHostname,
  resolvePublicStatusPageById,
} from '../src/public/status-page';
import {
  homepageFromStatusPayload,
  tryComputePublicHomepagePayloadFromScheduledRuntimeUpdates,
} from '../src/public/homepage';
import { tryComputePublicStatusPayloadFromScheduledRuntimeUpdates } from '../src/public/status-refresh';
import { DEFAULT_STATUS_PAGE_THEME_CONFIG } from '../src/schemas/status-pages';
import { readHomepageSnapshotArtifact } from '../src/snapshots/public-homepage';
import {
  readHomepageSnapshotArtifactJson,
  readHomepageSnapshotJson,
} from '../src/snapshots/public-homepage-read';
import { readStatusSnapshot } from '../src/snapshots/public-status';
import { readStatusSnapshotJson } from '../src/snapshots/public-status-read';
import { createFakeD1Database } from './helpers/fake-d1';

function legacyStatusPayload(now: number) {
  return {
    generated_at: now,
    site_title: 'Uptimer',
    site_description: '',
    logo_url: null,
    site_locale: 'auto' as const,
    site_timezone: 'UTC',
    uptime_rating_level: 3 as const,
    overall_status: 'up' as const,
    banner: {
      source: 'monitors' as const,
      status: 'operational' as const,
      title: 'All Systems Operational',
      down_ratio: null,
    },
    summary: { up: 0, down: 0, maintenance: 0, paused: 0, unknown: 0 },
    monitors: [],
    active_incidents: [],
    maintenance_windows: { active: [], upcoming: [] },
  };
}

function legacyHomepagePayload(now: number) {
  return {
    generated_at: now,
    bootstrap_mode: 'full' as const,
    monitor_count_total: 0,
    site_title: 'Uptimer',
    site_description: '',
    logo_url: null,
    site_locale: 'auto' as const,
    site_timezone: 'UTC',
    uptime_rating_level: 3 as const,
    overall_status: 'up' as const,
    banner: {
      source: 'monitors' as const,
      status: 'operational' as const,
      title: 'All Systems Operational',
      down_ratio: null,
    },
    summary: { up: 0, down: 0, maintenance: 0, paused: 0, unknown: 0 },
    monitors: [],
    active_incidents: [],
    maintenance_windows: { active: [], upcoming: [] },
    resolved_incident_preview: null,
    maintenance_history_preview: null,
  };
}

describe('public status page theme_config isolation, snapshot fallback, and fast guards', () => {
  it('parses theme_config_json across all 5 resolvers and degrades corrupt DB JSON to defaults', async () => {
    const rowA = {
      id: 1,
      slug: 'alpha',
      name: 'Alpha',
      title: 'Alpha Status',
      description: '',
      custom_hostname: 'alpha.example.test',
      logo_url: null,
      theme_config_json: JSON.stringify({
        custom_css: '.alpha { color: #09f; }',
        footer_hidden: true,
        footer_text: 'Alpha Footer',
      }),
      is_public: 1,
    };
    const corruptRow = {
      ...rowA,
      id: 2,
      slug: 'corrupt',
      custom_hostname: 'corrupt.example.test',
      theme_config_json: '{bad-json',
    };
    const unsafeDbRow = {
      ...rowA,
      id: 3,
      slug: 'unsafe',
      custom_hostname: 'unsafe.example.test',
      theme_config_json: JSON.stringify({
        custom_css: '<style>bad</style>',
        footer_hidden: true,
        footer_text: 'Ok',
      }),
    };

    const rowsByKey = new Map<unknown, typeof rowA>([
      ['alpha', rowA],
      ['corrupt', corruptRow],
      ['unsafe', unsafeDbRow],
      ['alpha.example.test', rowA],
      [1, rowA],
      [2, corruptRow],
      [3, unsafeDbRow],
    ]);

    const db = createFakeD1Database([
      {
        match: 'from status_pages',
        first: (args) => rowsByKey.get(args[0]) ?? null,
      },
    ]);

    await expect(resolvePublicStatusPage(db, 'alpha')).resolves.toMatchObject({
      theme_config: { custom_css: '.alpha { color: #09f; }', footer_hidden: true, footer_text: 'Alpha Footer' },
    });
    await expect(resolveAccessibleStatusPage(db, 'alpha', false)).resolves.toMatchObject({
      theme_config: { custom_css: '.alpha { color: #09f; }', footer_hidden: true, footer_text: 'Alpha Footer' },
    });
    await expect(resolveAccessibleStatusPageById(db, 1, false)).resolves.toMatchObject({
      theme_config: { custom_css: '.alpha { color: #09f; }', footer_hidden: true, footer_text: 'Alpha Footer' },
    });
    await expect(resolvePublicStatusPageById(db, 1)).resolves.toMatchObject({
      theme_config: { custom_css: '.alpha { color: #09f; }', footer_hidden: true, footer_text: 'Alpha Footer' },
    });
    await expect(resolvePublicStatusPageByHostname(db, 'alpha.example.test')).resolves.toMatchObject({
      theme_config: { custom_css: '.alpha { color: #09f; }', footer_hidden: true, footer_text: 'Alpha Footer' },
    });

    await expect(resolvePublicStatusPage(db, 'corrupt')).resolves.toMatchObject({
      theme_config: DEFAULT_STATUS_PAGE_THEME_CONFIG,
    });
    await expect(resolvePublicStatusPageById(db, 3)).resolves.toMatchObject({
      theme_config: DEFAULT_STATUS_PAGE_THEME_CONFIG,
    });
  });

  it('isolates per-page theme_config across /api/v1/public/status-pages/:slug/status and homepageFromStatusPayload', async () => {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: vi.fn(async () => ({ match: async () => undefined, put: async () => undefined })) },
    });

    const pages = new Map<unknown, Record<string, unknown>>([
      [
        'page-a',
        {
          id: 10,
          slug: 'page-a',
          name: 'Page A',
          title: 'Page A Status',
          description: '',
          custom_hostname: null,
          logo_url: null,
          theme_config_json: JSON.stringify({
            custom_css: '.a { color: red; }',
            footer_hidden: false,
            footer_text: 'Footer A',
          }),
          is_public: 1,
        },
      ],
      [
        'page-b',
        {
          id: 20,
          slug: 'page-b',
          name: 'Page B',
          title: 'Page B Status',
          description: '',
          custom_hostname: null,
          logo_url: null,
          theme_config_json: JSON.stringify({
            custom_css: '.b { color: blue; }',
            footer_hidden: true,
            footer_text: null,
          }),
          is_public: 1,
        },
      ],
    ]);

    const byId = new Map<unknown, Record<string, unknown>>([
      [10, pages.get('page-a')!],
      [20, pages.get('page-b')!],
    ]);

    const db = createFakeD1Database([
      {
        match: 'from status_pages',
        first: (args) => pages.get(args[0]) ?? byId.get(args[0]) ?? null,
      },
      { match: 'from monitors m', all: () => [] },
      { match: 'from incidents', all: () => [] },
      { match: 'from maintenance_windows', all: () => [] },
      { match: 'select value from settings', first: () => ({ value: '3' }) },
      { match: 'select key, value from settings', all: () => [] },
      { match: 'insert into public_snapshots', run: () => 1 },
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.notFound(handleNotFound);
    app.route('/api/v1/public', publicRoutes);

    const resA = await app.fetch(
      new Request('https://status.example.test/api/v1/public/status-pages/page-a/status'),
      { DB: db, ADMIN_TOKEN: 'test-admin-token' } as unknown as Env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    const jsonA = await resA.json();
    expect(resA.status).toBe(200);
    expect(jsonA).toMatchObject({
      theme_config: { custom_css: '.a { color: red; }', footer_hidden: false, footer_text: 'Footer A' },
      status_page: {
        slug: 'page-a',
        theme_config: { custom_css: '.a { color: red; }', footer_hidden: false, footer_text: 'Footer A' },
      },
    });
    expect(homepageFromStatusPayload(jsonA).theme_config).toEqual({
      custom_css: '.a { color: red; }',
      footer_hidden: false,
      footer_text: 'Footer A',
    });

    const resB = await app.fetch(
      new Request('https://status.example.test/api/v1/public/status-pages/page-b/status'),
      { DB: db, ADMIN_TOKEN: 'test-admin-token' } as unknown as Env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    const jsonB = await resB.json();
    expect(resB.status).toBe(200);
    expect(jsonB).toMatchObject({
      theme_config: { custom_css: '.b { color: blue; }', footer_hidden: true, footer_text: null },
      status_page: {
        slug: 'page-b',
        theme_config: { custom_css: '.b { color: blue; }', footer_hidden: true, footer_text: null },
      },
    });
  });

  it('materializes default theme_config on pre-deploy snapshots and rejects malformed stored theme_config', async () => {
    const now = 1_728_000_000;
    const legacyStatusBody = JSON.stringify(legacyStatusPayload(now - 5));
    const legacyHomepageBody = JSON.stringify(legacyHomepagePayload(now - 5));
    const legacyArtifactBody = JSON.stringify({
      generated_at: now - 5,
      preload_html: '<div></div>',
      meta_title: 'Uptimer',
      meta_description: '',
      snapshot: legacyHomepagePayload(now - 5),
    });

    const statusDb = createFakeD1Database([
      {
        match: 'from public_snapshots',
        first: () => ({ generated_at: now - 5, updated_at: now - 5, body_json: legacyStatusBody }),
      },
    ]);
    await expect(readStatusSnapshot(statusDb, now)).resolves.toMatchObject({
      data: { theme_config: DEFAULT_STATUS_PAGE_THEME_CONFIG },
    });
    const statusJson = await readStatusSnapshotJson(statusDb, now);
    expect(JSON.parse(statusJson!.bodyJson)).toMatchObject({
      theme_config: DEFAULT_STATUS_PAGE_THEME_CONFIG,
    });

    const homepageRows = [
      { key: 'homepage', generated_at: now - 5, updated_at: now - 5, body_json: legacyHomepageBody },
      { key: 'homepage:artifact', generated_at: now - 5, updated_at: now - 5, body_json: legacyArtifactBody },
    ];
    const homepageDb = createFakeD1Database([
      {
        match: 'from public_snapshots',
        first: (args) => homepageRows.find((row) => row.key === args[0]) ?? null,
        all: () => homepageRows,
      },
    ]);
    await expect(readHomepageSnapshotArtifact(homepageDb, now)).resolves.toMatchObject({
      data: { snapshot: { theme_config: DEFAULT_STATUS_PAGE_THEME_CONFIG } },
    });
    const homepageJson = await readHomepageSnapshotJson(homepageDb, now);
    expect(JSON.parse(homepageJson!.bodyJson)).toMatchObject({
      theme_config: DEFAULT_STATUS_PAGE_THEME_CONFIG,
    });
    const artifactJson = await readHomepageSnapshotArtifactJson(homepageDb, now);
    expect(JSON.parse(artifactJson!.bodyJson)).toMatchObject({
      snapshot: { theme_config: DEFAULT_STATUS_PAGE_THEME_CONFIG },
    });

    const malformedPayloads = [
      { ...legacyStatusPayload(now - 5), theme_config: 'bad' },
      { ...legacyStatusPayload(now - 5), theme_config: { custom_css: null, footer_hidden: 'yes', footer_text: null } },
      { ...legacyStatusPayload(now - 5), theme_config: { custom_css: 123, footer_hidden: false, footer_text: null } },
    ];
    for (const bad of malformedPayloads) {
      const badStatusDb = createFakeD1Database([
        {
          match: 'from public_snapshots',
          first: () => ({ generated_at: now - 5, updated_at: now - 5, body_json: JSON.stringify(bad) }),
        },
      ]);
      await expect(readStatusSnapshot(badStatusDb, now)).resolves.toBeNull();
    }

    const badHomepagePayloads = [
      { ...legacyHomepagePayload(now - 4), theme_config: 'bad' },
      { ...legacyHomepagePayload(now - 3), theme_config: { custom_css: null, footer_hidden: 'yes', footer_text: null } },
      { ...legacyHomepagePayload(now - 2), theme_config: { custom_css: 123, footer_hidden: false, footer_text: null } },
    ];
    for (const bad of badHomepagePayloads) {
      const badHomepageDb = createFakeD1Database([
        {
          match: 'from public_snapshots',
          all: () => [
            { key: 'homepage', generated_at: bad.generated_at, updated_at: bad.generated_at, body_json: JSON.stringify(bad) },
          ],
        },
      ]);
      await expect(readHomepageSnapshotJson(badHomepageDb, now)).resolves.toBeNull();
    }
  });

  it('invalidates status and homepage scheduled fast guards when only status_pages.theme_config_json changes', async () => {
    const now = 1_728_000_000;
    const oldTheme = { custom_css: '.old{}', footer_hidden: false, footer_text: 'Old' };
    const newThemeJson = JSON.stringify({
      custom_css: '.new{}',
      footer_hidden: true,
      footer_text: 'New',
    });

    const statusBase = {
      ...legacyStatusPayload(now - 20),
      site_title: 'Status',
      theme_config: oldTheme,
    };
    const homepageBase = {
      ...legacyHomepagePayload(now - 20),
      site_title: 'Status',
      theme_config: oldTheme,
    };

    const statusDb = createFakeD1Database([
      {
        match: 'as theme_config_json_value',
        first: () => ({
          site_title_value: 'Status',
          site_description_value: '',
          logo_url_value: null,
          theme_config_json_value: newThemeJson,
          site_locale_value: 'auto',
          site_timezone_value: 'UTC',
          uptime_rating_level_value: '3',
          monitor_count_total: 0,
          max_updated_at: null,
          has_active_incidents: 0,
          has_active_maintenance: 0,
          has_upcoming_maintenance: 0,
        }),
      },
    ]);

    await expect(
      tryComputePublicStatusPayloadFromScheduledRuntimeUpdates({
        db: statusDb,
        now,
        baseSnapshot: statusBase,
        baseSnapshotBodyJson: null,
        updates: [],
      }),
    ).resolves.toBeNull();

    const homepageDb = createFakeD1Database([
      {
        match: 'from public_snapshot_guard_versions',
        all: () => [],
      },
      {
        match: 'insert into public_snapshot_guard_versions',
        run: () => 1,
      },
      {
        match: 'as boundary_at',
        first: () => ({ boundary_at: null }),
      },
      {
        match: 'as theme_config_json_value',
        first: () => ({
          site_title_value: 'Status',
          site_description_value: '',
          logo_url_value: null,
          theme_config_json_value: newThemeJson,
          site_locale_value: 'auto',
          site_timezone_value: 'UTC',
          uptime_rating_level_value: '3',
          monitor_count_total: 0,
          max_updated_at: null,
          has_active_incidents: 0,
          has_resolved_incident_preview: 0,
          has_active_maintenance: 0,
          has_upcoming_maintenance: 0,
          has_maintenance_history_preview: 0,
        }),
      },
    ]);

    await expect(
      tryComputePublicHomepagePayloadFromScheduledRuntimeUpdates({
        db: homepageDb,
        now,
        baseSnapshot: homepageBase,
        baseSnapshotBodyJson: null,
        updates: [],
      }),
    ).resolves.toBeNull();
  });
});
