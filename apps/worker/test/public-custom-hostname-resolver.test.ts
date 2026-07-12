import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type { Env } from '../src/env';
import { AppError, handleError, handleNotFound } from '../src/middleware/errors';
import { publicRoutes } from '../src/routes/public';
import { resolvePublicStatusPageByHostname } from '../src/public/status-page';
import { createFakeD1Database } from './helpers/fake-d1';

function publicApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.notFound(handleNotFound);
  app.route('/api/v1/public', publicRoutes);
  return app;
}

function env(db: D1Database): Env {
  return { DB: db, ADMIN_TOKEN: 'test-admin-token' } as unknown as Env;
}

function installNoopCache() {
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      open: vi.fn(async () => ({ match: async () => undefined, put: async () => undefined })),
      default: { match: async () => undefined, put: async () => undefined },
    },
  });
}

describe('public custom hostname resolver', () => {
  beforeEach(() => {
    installNoopCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a bound public page by hostname', async () => {
    const db = createFakeD1Database([
      {
        match: (sql) => sql.includes('where custom_hostname ='),
        first: () => ({
          id: 7,
          slug: 'partners',
          name: 'Partners',
          title: 'Partner status',
          description: '',
          custom_hostname: 'status.partners.com',
        }),
      },
    ]);

    const res = await publicApp().fetch(
      new Request('https://status.example.test/api/v1/public/resolve-host?host=status.partners.com'),
      env(db),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: 7,
      slug: 'partners',
      custom_hostname: 'status.partners.com',
    });
  });

  it('fails closed for an unknown hostname', async () => {
    const db = createFakeD1Database([
      { match: (sql) => sql.includes('where custom_hostname ='), first: () => null },
    ]);

    await expect(resolvePublicStatusPageByHostname(db, 'unknown.example')).rejects.toMatchObject<AppError>({
      status: 404,
      code: 'NOT_FOUND',
    });

    const res = await publicApp().fetch(
      new Request('https://status.example.test/api/v1/public/resolve-host?host=unknown.example'),
      env(db),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('rejects an oversized or empty host query', async () => {
    const res = await publicApp().fetch(
      new Request('https://status.example.test/api/v1/public/resolve-host?host='),
      env(createFakeD1Database([])),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.status).toBe(400);
  });

  it('returns only routing-safe public metadata (no monitor_ids or internal fields)', async () => {
    const db = createFakeD1Database([
      {
        match: (sql) => sql.includes('where custom_hostname ='),
        first: () => ({
          id: 7,
          slug: 'partners',
          name: 'Partners',
          title: 'Partner status',
          description: '',
          custom_hostname: 'status.partners.com',
        }),
      },
    ]);

    const res = await publicApp().fetch(
      new Request('https://status.example.test/api/v1/public/resolve-host?host=status.partners.com'),
      env(db),
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('monitor_ids');
    expect(body).not.toHaveProperty('is_public');
    expect(body).not.toHaveProperty('created_at');
  });
});
