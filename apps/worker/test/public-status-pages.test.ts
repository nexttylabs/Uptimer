import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type { Env } from '../src/env';
import { AppError, handleError, handleNotFound } from '../src/middleware/errors';
import { publicRoutes } from '../src/routes/public';
import {
  assertStatusPageMonitor,
  resolvePublicStatusPage,
} from '../src/public/status-page';
import { createFakeD1Database } from './helpers/fake-d1';
import { readPageStatusSnapshotJson } from '../src/snapshots/public-status-read';

describe('public status page scope', () => {
  it('resolves a public slug and rejects an unknown or private page', async () => {
    const db = createFakeD1Database([
      {
        match: 'from status_pages',
        first: (args) =>
          args[0] === 'partners'
            ? { id: 4, slug: 'partners', name: 'Partners', title: 'Partner status', description: '' }
            : null,
      },
    ]);

    await expect(resolvePublicStatusPage(db, 'partners')).resolves.toMatchObject({ id: 4 });
    await expect(resolvePublicStatusPage(db, 'missing')).rejects.toMatchObject<AppError>({ status: 404 });
  });

  it('returns only the resolved page payload from the slug route', async () => {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: vi.fn(async () => ({ match: async () => undefined, put: async () => undefined })) },
    });
    const db = createFakeD1Database([
      {
        match: 'from status_pages',
        first: () => ({ id: 4, slug: 'partners', name: 'Partners', title: 'Partner status', description: '' }),
      },
      {
        match: 'from monitors m',
        all: () => [],
      },
      { match: 'from incidents', all: () => [] },
      { match: 'from maintenance_windows', all: () => [] },
      { match: 'select value from settings', first: () => ({ value: '3' }) },
      { match: 'select key, value from settings', all: () => [] },
    ]);
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.notFound(handleNotFound);
    app.route('/api/v1/public', publicRoutes);

    const res = await app.fetch(
      new Request('https://status.example.test/api/v1/public/status-pages/partners/status'),
      { DB: db, ADMIN_TOKEN: 'test-admin-token' } as unknown as Env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      monitors: [],
      status_page: { slug: 'partners', name: 'Partners' },
    });
  });

  it('does not read a default snapshot for a different page', async () => {
    const db = createFakeD1Database([
      {
        match: 'from public_snapshots',
        first: (args) => (args[0] === 'status:page:4' ? null : { generated_at: 190, body_json: '{}' }),
      },
    ]);

    await expect(readPageStatusSnapshotJson(db, 200, 4)).resolves.toBeNull();
  });

  it('renders explicitly linked incidents without monitor links', async () => {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: vi.fn(async () => ({ match: async () => undefined, put: async () => undefined })) },
    });
    const db = createFakeD1Database([
      {
        match: 'from status_pages',
        first: () => ({ id: 4, slug: 'partners', name: 'Partners', title: 'Partner status', description: '' }),
      },
      {
        match: (sql) => sql.includes('join status_page_incidents'),
        all: () => [{ id: 11, title: 'Partner incident', status: 'investigating', impact: 'minor', message: null, started_at: 10, resolved_at: null }],
      },
      { match: 'from incident_updates', all: () => [] },
      { match: 'from incident_monitors', all: () => [] },
    ]);
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.notFound(handleNotFound);
    app.route('/api/v1/public', publicRoutes);

    const res = await app.fetch(
      new Request('https://status.example.test/api/v1/public/status-pages/partners/incidents'),
      { DB: db, ADMIN_TOKEN: 'test-admin-token' } as unknown as Env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      incidents: [{ id: 11, title: 'Partner incident', monitor_ids: [] }],
    });
  });

  it('renders explicitly linked maintenance windows without monitor links', async () => {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: vi.fn(async () => ({ match: async () => undefined, put: async () => undefined })) },
    });
    const db = createFakeD1Database([
      {
        match: 'from status_pages',
        first: () => ({ id: 4, slug: 'partners', name: 'Partners', title: 'Partner status', description: '' }),
      },
      {
        match: (sql) => sql.includes('join status_page_maintenance_windows'),
        all: () => [{ id: 12, title: 'Partner maintenance', message: null, starts_at: 10, ends_at: 20, created_at: 1 }],
      },
      { match: 'from maintenance_window_monitors', all: () => [] },
    ]);
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.notFound(handleNotFound);
    app.route('/api/v1/public', publicRoutes);

    const res = await app.fetch(
      new Request('https://status.example.test/api/v1/public/status-pages/partners/maintenance-windows'),
      { DB: db, ADMIN_TOKEN: 'test-admin-token' } as unknown as Env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      maintenance_windows: [{ id: 12, title: 'Partner maintenance', monitor_ids: [] }],
    });
  });

  it('filters analytics to the requested page monitor links', async () => {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: vi.fn(async () => ({ match: async () => undefined, put: async () => undefined })) },
    });
    const db = createFakeD1Database([
      {
        match: 'from status_pages',
        first: () => ({ id: 4, slug: 'partners', name: 'Partners', title: 'Partner status', description: '' }),
      },
      {
        match: (sql) => sql.includes('join status_page_monitors'),
        all: (args) => args[0] === 4 ? [] : [{ id: 99 }],
      },
      { match: 'from monitor_daily_rollups', all: () => [] },
    ]);
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.notFound(handleNotFound);
    app.route('/api/v1/public', publicRoutes);

    const res = await app.fetch(
      new Request('https://status.example.test/api/v1/public/analytics/uptime?__status_page=partners'),
      { DB: db, ADMIN_TOKEN: 'test-admin-token' } as unknown as Env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ monitors: [] });
  });

  it('returns 404 before reading a monitor outside the requested page', async () => {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { open: vi.fn(async () => ({ match: async () => undefined, put: async () => undefined })) },
    });
    const db = createFakeD1Database([
      {
        match: 'from status_pages',
        first: () => ({ id: 4, slug: 'partners', name: 'Partners', title: 'Partner status', description: '' }),
      },
      { match: (sql) => sql.includes('join status_page_monitors'), first: () => null },
    ]);
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.notFound(handleNotFound);
    app.route('/api/v1/public', publicRoutes);

    const res = await app.fetch(
      new Request('https://status.example.test/api/v1/public/monitors/9/uptime?__status_page=partners'),
      { DB: db, ADMIN_TOKEN: 'test-admin-token' } as unknown as Env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('rejects a monitor outside the resolved status page', async () => {
    const db = createFakeD1Database([
      {
        match: (sql) => sql.includes('join status_page_monitors'),
        first: (args) => (args[0] === 4 && args[1] === 7 ? { id: 7 } : null),
      },
    ]);

    await expect(assertStatusPageMonitor(db, 4, 7)).resolves.toEqual({ id: 7 });
    await expect(assertStatusPageMonitor(db, 4, 9)).rejects.toMatchObject<AppError>({ status: 404 });
  });
});
