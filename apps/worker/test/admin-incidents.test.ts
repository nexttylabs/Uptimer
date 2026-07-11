import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:sockets', () => ({ connect: vi.fn() }));

import { Hono } from 'hono';

import type { Env } from '../src/env';
import { handleError, handleNotFound } from '../src/middleware/errors';
import { adminRoutes } from '../src/routes/admin';
import { createFakeD1Database, type FakeD1QueryHandler } from './helpers/fake-d1';
import { createIncidentInputSchema } from '../src/schemas/incidents';

function app() {
  const instance = new Hono<{ Bindings: Env }>();
  instance.onError(handleError);
  instance.notFound(handleNotFound);
  instance.route('/api/v1/admin', adminRoutes);
  return instance;
}

function env(handlers: FakeD1QueryHandler[]): Env {
  return {
    DB: createFakeD1Database(handlers),
    ADMIN_TOKEN: 'test-admin-token',
    ADMIN_RATE_LIMIT_MAX: '100',
    ADMIN_RATE_LIMIT_WINDOW_SEC: '60',
  } as unknown as Env;
}

function jsonResponse(res: Response): Promise<unknown> {
  return res.json();
}

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

  it('returns existing status_page_ids on the create, list, update, and resolve responses', async () => {
    const queued: unknown[][] = [];
    const handlers: FakeD1QueryHandler[] = [
      { match: 'select id from monitors', all: () => [{ id: 7 }] },
      { match: 'select id from status_pages', all: () => [{ id: 4 }] },
      {
        match: 'insert into incidents',
        first: () => ({
          id: 11,
          title: 'Partner API outage',
          status: 'investigating',
          impact: 'minor',
          message: null,
          started_at: 100,
          resolved_at: null,
        }),
      },
      {
        match: 'insert into incident_monitors',
        run: () => 1,
      },
      {
        match: 'insert into status_page_incidents',
        run: () => 1,
      },
      {
        match: 'insert into status_page_refresh_queue',
        run: (args) => {
          queued.push(args);
          return 1;
        },
      },
      {
        match: 'insert into public_snapshot_guard_versions',
        run: () => 1,
      },
      {
        match: 'select id, title, status, impact, message, started_at, resolved_at from incidents',
        all: () => [
          {
            id: 11,
            title: 'Partner API outage',
            status: 'investigating',
            impact: 'minor',
            message: null,
            started_at: 100,
            resolved_at: null,
          },
        ],
      },
      {
        match: 'select incident_id, monitor_id from incident_monitors',
        all: () => [{ incident_id: 11, monitor_id: 7 }],
      },
      {
        match: 'select incident_id, status_page_id from status_page_incidents',
        all: () => [{ incident_id: 11, status_page_id: 4 }],
      },
      {
        match: 'select id, incident_id, status, message, created_at from incident_updates',
        all: () => [],
      },
    ];

    const bindings = env(handlers);
    const instance = app();

    // Create
    const createRes = await instance.fetch(
      new Request('https://status.example.test/api/v1/admin/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin-token' },
        body: JSON.stringify({
          title: 'Partner API outage',
          impact: 'minor',
          status: 'investigating',
          monitor_ids: [7],
          status_page_ids: [4],
        }),
      }),
      bindings,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(createRes.status).toBe(201);
    await expect(jsonResponse(createRes)).resolves.toMatchObject({
      incident: { id: 11, monitor_ids: [7], status_page_ids: [4] },
    });

    // List
    const listRes = await instance.fetch(
      new Request('https://status.example.test/api/v1/admin/incidents?limit=50', {
        headers: { Authorization: 'Bearer test-admin-token' },
      }),
      bindings,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(listRes.status).toBe(200);
    await expect(jsonResponse(listRes)).resolves.toMatchObject({
      incidents: [{ id: 11, monitor_ids: [7], status_page_ids: [4] }],
    });
  });
});
