import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:sockets', () => ({ connect: vi.fn() }));

import { Hono } from 'hono';

import type { Env } from '../src/env';
import { handleError, handleNotFound } from '../src/middleware/errors';
import { adminRoutes } from '../src/routes/admin';
import { createFakeD1Database, type FakeD1QueryHandler } from './helpers/fake-d1';
import {
  createMaintenanceWindowInputSchema,
  patchMaintenanceWindowInputSchema,
} from '../src/schemas/maintenance-windows';

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

describe('admin maintenance status-page contract', () => {
  it('requires explicit status pages on create and permits explicit link replacement on patch', () => {
    const base = {
      title: 'Partner maintenance',
      starts_at: 100,
      ends_at: 200,
      monitor_ids: [7],
    };

    expect(createMaintenanceWindowInputSchema.safeParse(base).success).toBe(false);
    expect(
      createMaintenanceWindowInputSchema.safeParse({ ...base, status_page_ids: [4] }),
    ).toMatchObject({ success: true });
    expect(patchMaintenanceWindowInputSchema.safeParse({ status_page_ids: [4, 5] })).toMatchObject({
      success: true,
    });
  });

  it('returns existing status_page_ids on the create, list, and update responses', async () => {
    const handlers: FakeD1QueryHandler[] = [
      { match: 'select id from monitors', all: () => [{ id: 7 }] },
      { match: 'select id from status_pages', all: () => [{ id: 4 }] },
      {
        match: 'insert into maintenance_windows',
        first: () => ({
          id: 21,
          title: 'Partner maintenance',
          message: null,
          starts_at: 100,
          ends_at: 200,
          created_at: 50,
        }),
      },
      {
        match: 'update maintenance_windows',
        first: () => ({
          id: 21,
          title: 'Partner maintenance (edited)',
          message: null,
          starts_at: 100,
          ends_at: 200,
          created_at: 50,
        }),
      },
      {
        match: 'insert into maintenance_window_monitors',
        run: () => 1,
      },
      {
        match: 'insert into status_page_maintenance_windows',
        run: () => 1,
      },
      {
        match: 'delete from maintenance_window_monitors',
        run: () => 1,
      },
      {
        match: 'delete from status_page_maintenance_windows',
        run: () => 1,
      },
      {
        match: 'insert into status_page_refresh_queue',
        run: () => 1,
      },
      {
        match: 'insert into public_snapshot_guard_versions',
        run: () => 1,
      },
      {
        match: 'select id, title, message, starts_at, ends_at, created_at from maintenance_windows',
        first: () => ({
          id: 21,
          title: 'Partner maintenance',
          message: null,
          starts_at: 100,
          ends_at: 200,
          created_at: 50,
        }),
        all: () => [
          {
            id: 21,
            title: 'Partner maintenance (edited)',
            message: null,
            starts_at: 100,
            ends_at: 200,
            created_at: 50,
          },
        ],
      },
      {
        match: 'select maintenance_window_id, monitor_id from maintenance_window_monitors',
        all: () => [{ maintenance_window_id: 21, monitor_id: 7 }],
      },
      {
        match: 'from status_page_maintenance_windows',
        all: () => [{ maintenance_window_id: 21, status_page_id: 4 }],
      },
    ];

    const bindings = env(handlers);
    const instance = app();

    // Create
    const createRes = await instance.fetch(
      new Request('https://status.example.test/api/v1/admin/maintenance-windows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin-token' },
        body: JSON.stringify({
          title: 'Partner maintenance',
          starts_at: 100,
          ends_at: 200,
          monitor_ids: [7],
          status_page_ids: [4],
        }),
      }),
      bindings,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(createRes.status).toBe(201);
    await expect(jsonResponse(createRes)).resolves.toMatchObject({
      maintenance_window: { id: 21, monitor_ids: [7], status_page_ids: [4] },
    });

    // Patch (retain links by re-sending the same set)
    const patchRes = await instance.fetch(
      new Request('https://status.example.test/api/v1/admin/maintenance-windows/21', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin-token' },
        body: JSON.stringify({
          title: 'Partner maintenance (edited)',
          status_page_ids: [4],
        }),
      }),
      bindings,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(patchRes.status).toBe(200);
    await expect(jsonResponse(patchRes)).resolves.toMatchObject({
      maintenance_window: { id: 21, monitor_ids: [7], status_page_ids: [4] },
    });

    // List
    const listRes = await instance.fetch(
      new Request('https://status.example.test/api/v1/admin/maintenance-windows?limit=50', {
        headers: { Authorization: 'Bearer test-admin-token' },
      }),
      bindings,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(listRes.status).toBe(200);
    await expect(jsonResponse(listRes)).resolves.toMatchObject({
      maintenance_windows: [{ id: 21, monitor_ids: [7], status_page_ids: [4] }],
    });
  });
});
