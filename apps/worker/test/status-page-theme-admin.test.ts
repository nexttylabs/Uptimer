import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type { Env } from '../src/env';
import { handleError, handleNotFound } from '../src/middleware/errors';
import { adminStatusPageRoutes } from '../src/routes/admin-status-pages';
import {
  DEFAULT_STATUS_PAGE_THEME_CONFIG,
  parseCustomCssInput,
  parseFooterTextInput,
  parseStoredThemeConfigJson,
  serializeThemeConfigJson,
} from '../src/schemas/status-pages';
import { createFakeD1Database, type FakeD1QueryHandler } from './helpers/fake-d1';

function createAdminApp() {
  const instance = new Hono<{ Bindings: Env }>();
  instance.onError(handleError);
  instance.notFound(handleNotFound);
  instance.route('/api/v1/admin/status-pages', adminStatusPageRoutes);
  return instance;
}

function createEnv(handlers: FakeD1QueryHandler[]): Env {
  return {
    DB: createFakeD1Database(handlers),
    ADMIN_TOKEN: 'test-admin-token',
    ADMIN_RATE_LIMIT_MAX: '100',
    ADMIN_RATE_LIMIT_WINDOW_SEC: '60',
  } as unknown as Env;
}

function adminRequest(
  instance: ReturnType<typeof createAdminApp>,
  bindings: Env,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<Response> {
  return instance.fetch(
    new Request(`https://status.example.test${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    bindings,
    { waitUntil: vi.fn() } as unknown as ExecutionContext,
  );
}

describe('admin status page theme_config validation & API', () => {
  it('persists, reads, merges, and clears theme_config across GET/POST/PATCH', async () => {
    let storedRow = {
      id: 4,
      slug: 'partners',
      name: 'Partners',
      title: 'Partner Status',
      description: '',
      custom_hostname: null as string | null,
      logo_url: null as string | null,
      theme_config_json: null as string | null,
      is_public: 1,
      created_at: 100,
      updated_at: 100,
    };
    const seenThemeJsons: (string | null)[] = [];

    const bindings = createEnv([
      { match: 'select id from status_pages', first: () => null },
      { match: 'select id from monitors', all: () => [] },
      { match: 'select monitor_id from status_page_monitors', all: () => [] },
      {
        match: 'insert into status_pages',
        first: (args) => {
          seenThemeJsons.push(args[6] as string | null);
          storedRow = {
            ...storedRow,
            slug: args[0] as string,
            name: args[1] as string,
            title: args[2] as string,
            description: args[3] as string,
            theme_config_json: args[6] as string | null,
          };
          return storedRow;
        },
      },
      {
        match: 'select id, slug, name, title, description, custom_hostname, logo_url, theme_config_json, is_public, created_at, updated_at from status_pages where id = ?1',
        first: () => storedRow,
      },
      {
        match: 'select id, slug, name, title, description, custom_hostname, logo_url, theme_config_json, is_public, created_at, updated_at from status_pages order by id',
        all: () => [storedRow],
      },
      {
        match: 'update status_pages',
        first: (args) => {
          seenThemeJsons.push(args[6] as string | null);
          storedRow = {
            ...storedRow,
            theme_config_json: args[6] as string | null,
            updated_at: args[8] as number,
          };
          return storedRow;
        },
      },
      { match: 'insert into status_page_refresh_queue', run: () => 1 },
    ]);

    const app = createAdminApp();
    const createRes = await adminRequest(app, bindings, 'POST', '/api/v1/admin/status-pages', {
      slug: 'partners',
      name: 'Partners',
      title: 'Partner Status',
      theme_config: {
        custom_css: '  body { color: #111; }  ',
        footer_hidden: false,
        footer_text: '  Partner Ops <team>  ',
      },
    });
    expect(createRes.status).toBe(201);
    await expect(createRes.json()).resolves.toMatchObject({
      status_page: {
        slug: 'partners',
        theme_config: {
          custom_css: 'body { color: #111; }',
          footer_hidden: false,
          footer_text: 'Partner Ops <team>',
        },
      },
    });

    const listRes = await adminRequest(app, bindings, 'GET', '/api/v1/admin/status-pages');
    expect(listRes.status).toBe(200);
    await expect(listRes.json()).resolves.toMatchObject({
      status_pages: [
        {
          slug: 'partners',
          theme_config: {
            custom_css: 'body { color: #111; }',
            footer_hidden: false,
            footer_text: 'Partner Ops <team>',
          },
        },
      ],
    });

    const partialPatch = await adminRequest(app, bindings, 'PATCH', '/api/v1/admin/status-pages/4', {
      theme_config: { footer_hidden: true },
    });
    expect(partialPatch.status).toBe(200);
    await expect(partialPatch.json()).resolves.toMatchObject({
      status_page: {
        theme_config: {
          custom_css: 'body { color: #111; }',
          footer_hidden: true,
          footer_text: 'Partner Ops <team>',
        },
      },
    });

    const clearFieldsPatch = await adminRequest(app, bindings, 'PATCH', '/api/v1/admin/status-pages/4', {
      theme_config: {
        custom_css: '   \n  ',
        footer_hidden: false,
        footer_text: '',
      },
    });
    expect(clearFieldsPatch.status).toBe(200);
    await expect(clearFieldsPatch.json()).resolves.toMatchObject({
      status_page: {
        theme_config: DEFAULT_STATUS_PAGE_THEME_CONFIG,
      },
    });

    expect(seenThemeJsons[seenThemeJsons.length - 1]).toBeNull();
  });

  it('supports null theme_config clear on PATCH and accepts boundary lengths and safe escapes', async () => {
    const prefix = `.a { content: "\\\\3c"; }\n`;
    const exactMaxCss = `${prefix}${'a{}'.repeat(Math.ceil(16384 / 3))}`.slice(0, 16384);
    expect(exactMaxCss.length).toBe(16384);
    expect(parseCustomCssInput(`  ${exactMaxCss}  `)).toBe(exactMaxCss);
    expect(parseCustomCssInput(`/* comment */ body { content: "\\\\3c"; }`)).toBe(
      `/* comment */ body { content: "\\\\3c"; }`,
    );

    const exactFooter = 'x'.repeat(200);
    expect(parseFooterTextInput(`  ${exactFooter}  `)).toBe(exactFooter);
    expect(parseFooterTextInput('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');

    let storedThemeJson: string | null = serializeThemeConfigJson({
      custom_css: 'body{}',
      footer_hidden: true,
      footer_text: 'Custom',
    });
    const bindings = createEnv([
      {
        match: 'select id, slug, name, title, description, custom_hostname, logo_url, theme_config_json, is_public, created_at, updated_at from status_pages where id = ?1',
        first: () => ({
          id: 4,
          slug: 'partners',
          name: 'Partners',
          title: 'Partner Status',
          description: '',
          custom_hostname: null,
          logo_url: null,
          theme_config_json: storedThemeJson,
          is_public: 1,
          created_at: 100,
          updated_at: 100,
        }),
      },
      { match: 'select monitor_id from status_page_monitors', all: () => [] },
      {
        match: 'update status_pages',
        first: (args) => {
          storedThemeJson = args[6] as string | null;
          return {
            id: 4,
            slug: 'partners',
            name: 'Partners',
            title: 'Partner Status',
            description: '',
            custom_hostname: null,
            logo_url: null,
            theme_config_json: storedThemeJson,
            is_public: 1,
            created_at: 100,
            updated_at: 120,
          };
        },
      },
      { match: 'insert into status_page_refresh_queue', run: () => 1 },
    ]);

    const res = await adminRequest(createAdminApp(), bindings, 'PATCH', '/api/v1/admin/status-pages/4', {
      theme_config: null,
    });
    expect(res.status).toBe(200);
    expect(storedThemeJson).toBeNull();
    await expect(res.json()).resolves.toMatchObject({
      status_page: { theme_config: DEFAULT_STATUS_PAGE_THEME_CONFIG },
    });
  });

  it('rejects unsafe, oversized, and malformed theme_config inputs with 400 INVALID_ARGUMENT before any DB write', async () => {
    const app = createAdminApp();
    const emptyBindings = createEnv([]);

    const invalidCssPayloads = [
      'a'.repeat(16385),
      '<style>body{}</style>',
      '</style><script>alert(1)</script>',
      '\\3c /style>',
      '\\00003cscript>alert(1)',
      '@import url("https://evil.test/x.css");',
      '@\\69 mport "x.css";',
      '.x { background: url(javascript:alert(1)); }',
      '.x { background: url(vbscript:msgbox(1)); }',
      '.x { background: url(data:text/html,<svg/>); }',
      '.x { width: expression(alert(1)); }',
      '.x { -moz-binding: url("x.xml"); }',
      '.x { behavior: url(#default#time2); }',
      'body { color: red\u0000; }',
      'body { color: red\u0007; }',
      'body { color: red\u007f; }',
    ];

    for (const badCss of invalidCssPayloads) {
      const postRes = await adminRequest(app, emptyBindings, 'POST', '/api/v1/admin/status-pages', {
        slug: 'partners',
        name: 'Partners',
        title: 'Partner Status',
        theme_config: { custom_css: badCss },
      });
      expect(postRes.status, `POST should reject ${JSON.stringify(badCss.slice(0, 40))}`).toBe(400);
      await expect(postRes.json()).resolves.toMatchObject({
        error: { code: 'INVALID_ARGUMENT' },
      });

      const patchRes = await adminRequest(app, emptyBindings, 'PATCH', '/api/v1/admin/status-pages/4', {
        theme_config: { custom_css: badCss },
      });
      expect(patchRes.status, `PATCH should reject ${JSON.stringify(badCss.slice(0, 40))}`).toBe(400);
      await expect(patchRes.json()).resolves.toMatchObject({
        error: { code: 'INVALID_ARGUMENT' },
      });
    }

    const invalidPayloads: unknown[] = [
      { theme_config: 'bad' },
      { theme_config: [] },
      { theme_config: { footer_hidden: 'yes' } },
      { theme_config: { custom_css: 123 } },
      { theme_config: { footer_text: 456 } },
      { theme_config: { extra_field: true } },
      { theme_config: { footer_text: 'line1\nline2' } },
      { theme_config: { footer_text: 'line1\rline2' } },
      { theme_config: { footer_text: 'line1\tline2' } },
      { theme_config: { footer_text: 'null\u0000byte' } },
      { theme_config: { footer_text: 'x'.repeat(201) } },
    ];

    for (const payload of invalidPayloads) {
      const patchRes = await adminRequest(app, emptyBindings, 'PATCH', '/api/v1/admin/status-pages/4', payload);
      expect(patchRes.status, `PATCH should reject ${JSON.stringify(payload)}`).toBe(400);
      await expect(patchRes.json()).resolves.toMatchObject({
        error: { code: 'INVALID_ARGUMENT' },
      });
    }

    expect(parseStoredThemeConfigJson('not-json')).toEqual(DEFAULT_STATUS_PAGE_THEME_CONFIG);
  });
});
