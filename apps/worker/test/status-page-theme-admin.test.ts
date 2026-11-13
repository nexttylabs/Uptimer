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

function app() {
  const instance = new Hono<{ Bindings: Env }>();
  instance.onError(handleError);
  instance.notFound(handleNotFound);
  instance.route('/api/v1/admin/status-pages', adminStatusPageRoutes);
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

function postStatusPage(
  instance: ReturnType<typeof app>,
  bindings: Env,
  body: unknown,
): Promise<Response> {
  return instance.fetch(
    new Request('https://status.example.test/api/v1/admin/status-pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    bindings,
    { waitUntil: vi.fn() } as unknown as ExecutionContext,
  );
}

function patchStatusPage(
  instance: ReturnType<typeof app>,
  bindings: Env,
  id: number,
  body: unknown,
): Promise<Response> {
  return instance.fetch(
    new Request(`https://status.example.test/api/v1/admin/status-pages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    bindings,
    { waitUntil: vi.fn() } as unknown as ExecutionContext,
  );
}

function getStatusPages(instance: ReturnType<typeof app>, bindings: Env): Promise<Response> {
  return instance.fetch(
    new Request('https://status.example.test/api/v1/admin/status-pages', {
      method: 'GET',
    }),
    bindings,
    { waitUntil: vi.fn() } as unknown as ExecutionContext,
  );
}

describe('status page theme_config Admin API and schema validation (A1)', () => {
  it('persists valid custom_css with >, @media, custom properties, footer_hidden, and footer_text on POST and returns them on GET', async () => {
    const validCss =
      ':root { --brand: #0ea5e9; }\n@media (min-width: 640px) {\n  main > section { color: var(--brand); }\n}';
    let storedThemeJson: string | null = null;

    const bindings = env([
      { match: 'select id from status_pages', first: () => null },
      { match: 'select id from monitors', all: () => [] },
      {
        match: 'insert into status_pages',
        first: (args) => {
          storedThemeJson = args[6] as string | null;
          return {
            id: 4,
            slug: 'alpha',
            name: 'Alpha',
            title: 'Alpha Status',
            description: '',
            custom_hostname: null,
            logo_url: null,
            theme_config_json: storedThemeJson,
            is_public: 1,
            created_at: 10,
            updated_at: 10,
          };
        },
      },
      { match: 'insert into status_page_refresh_queue', run: () => 1 },
      {
        match: 'from status_pages',
        all: () => [
          {
            id: 4,
            slug: 'alpha',
            name: 'Alpha',
            title: 'Alpha Status',
            description: '',
            custom_hostname: null,
            logo_url: null,
            theme_config_json: storedThemeJson,
            is_public: 1,
            created_at: 10,
            updated_at: 10,
          },
        ],
      },
      { match: 'select monitor_id from status_page_monitors', all: () => [] },
    ]);

    const postRes = await postStatusPage(app(), bindings, {
      slug: 'alpha',
      name: 'Alpha',
      title: 'Alpha Status',
      theme_config: {
        custom_css: `  ${validCss}  `,
        footer_hidden: true,
        footer_text: '  Alpha Ops Team  ',
      },
    });
    expect(postRes.status).toBe(201);
    await expect(postRes.json()).resolves.toMatchObject({
      status_page: {
        id: 4,
        theme_config: {
          custom_css: validCss,
          footer_hidden: true,
          footer_text: 'Alpha Ops Team',
        },
      },
    });

    const getRes = await getStatusPages(app(), bindings);
    expect(getRes.status).toBe(200);
    await expect(getRes.json()).resolves.toMatchObject({
      status_pages: [
        {
          id: 4,
          theme_config: {
            custom_css: validCss,
            footer_hidden: true,
            footer_text: 'Alpha Ops Team',
          },
        },
      ],
    });
  });

  it('partially merges PATCH theme_config, preserves omitted keys, clears empty/null to NULL, and keeps omitted theme_config as no-op', async () => {
    let currentThemeJson: string | null = serializeThemeConfigJson({
      custom_css: 'body { color: red; }',
      footer_hidden: true,
      footer_text: 'Initial Footer',
    });

    const bindings = env([
      {
        match: 'from status_pages where id = ?1',
        first: () => ({
          id: 4,
          slug: 'alpha',
          name: 'Alpha',
          title: 'Alpha Status',
          description: '',
          custom_hostname: null,
          logo_url: null,
          theme_config_json: currentThemeJson,
          is_public: 1,
          created_at: 10,
          updated_at: 10,
        }),
      },
      { match: 'select monitor_id from status_page_monitors', all: () => [] },
      {
        match: 'update status_pages',
        first: (args) => {
          currentThemeJson = args[6] as string | null;
          return {
            id: 4,
            slug: 'alpha',
            name: 'Alpha',
            title: 'Alpha Status',
            description: '',
            custom_hostname: null,
            logo_url: null,
            theme_config_json: currentThemeJson,
            is_public: 1,
            created_at: 10,
            updated_at: 20,
          };
        },
      },
      { match: 'insert into status_page_refresh_queue', run: () => 1 },
    ]);

    // 1. Omitted theme_config is a no-op on theme_config_json.
    const noopRes = await patchStatusPage(app(), bindings, 4, { title: 'Alpha Updated' });
    expect(noopRes.status).toBe(200);
    await expect(noopRes.json()).resolves.toMatchObject({
      status_page: {
        theme_config: {
          custom_css: 'body { color: red; }',
          footer_hidden: true,
          footer_text: 'Initial Footer',
        },
      },
    });

    // 2. Partial PATCH updates footer_text while preserving custom_css and footer_hidden.
    const partialRes = await patchStatusPage(app(), bindings, 4, {
      theme_config: { footer_text: 'Updated Footer' },
    });
    expect(partialRes.status).toBe(200);
    await expect(partialRes.json()).resolves.toMatchObject({
      status_page: {
        theme_config: {
          custom_css: 'body { color: red; }',
          footer_hidden: true,
          footer_text: 'Updated Footer',
        },
      },
    });

    // 3. Whitespace-only strings clear individual fields to null.
    const clearCssRes = await patchStatusPage(app(), bindings, 4, {
      theme_config: { custom_css: '   \n  ', footer_text: '' },
    });
    expect(clearCssRes.status).toBe(200);
    await expect(clearCssRes.json()).resolves.toMatchObject({
      status_page: {
        theme_config: {
          custom_css: null,
          footer_hidden: true,
          footer_text: null,
        },
      },
    });
    expect(currentThemeJson).not.toBeNull();

    // 4. theme_config: null resets all fields to defaults and serializes to NULL.
    const resetRes = await patchStatusPage(app(), bindings, 4, {
      theme_config: null,
    });
    expect(resetRes.status).toBe(200);
    await expect(resetRes.json()).resolves.toMatchObject({
      status_page: {
        theme_config: DEFAULT_STATUS_PAGE_THEME_CONFIG,
      },
    });
    expect(currentThemeJson).toBeNull();
  });

  it('reads corrupt DB theme_config_json safely as defaults', async () => {
    const bindings = env([
      {
        match: 'from status_pages',
        all: () => [
          {
            id: 1,
            slug: 'default',
            name: 'Default',
            title: 'Uptimer',
            description: '',
            custom_hostname: null,
            logo_url: null,
            theme_config_json: '{not-valid-json',
            is_public: 1,
            created_at: 1,
            updated_at: 1,
          },
        ],
      },
      { match: 'select monitor_id from status_page_monitors', all: () => [] },
    ]);

    const res = await getStatusPages(app(), bindings);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status_pages: [{ id: 1, theme_config: DEFAULT_STATUS_PAGE_THEME_CONFIG }],
    });
    expect(parseStoredThemeConfigJson('{"custom_css":"<script>","footer_hidden":"yes"}')).toEqual(
      DEFAULT_STATUS_PAGE_THEME_CONFIG,
    );
  });

  it('accepts boundary lengths (16384 custom_css, 200 footer_text) and rejects 16385 / 201', async () => {
    const maxCss = 'a'.repeat(16_384);
    const overCss = 'a'.repeat(16_385);
    const maxFooter = 'b'.repeat(200);
    const overFooter = 'b'.repeat(201);

    expect(parseCustomCssInput(maxCss)).toEqual({ ok: true, value: maxCss });
    expect(parseCustomCssInput(overCss).ok).toBe(false);
    expect(parseFooterTextInput(maxFooter)).toEqual({ ok: true, value: maxFooter });
    expect(parseFooterTextInput(overFooter).ok).toBe(false);

    const failCssRes = await postStatusPage(app(), env([]), {
      slug: 'alpha',
      name: 'Alpha',
      title: 'Alpha',
      theme_config: { custom_css: overCss },
    });
    expect(failCssRes.status).toBe(400);
    await expect(failCssRes.json()).resolves.toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });

    const failFooterRes = await patchStatusPage(app(), env([]), 4, {
      theme_config: { footer_text: overFooter },
    });
    expect(failFooterRes.status).toBe(400);
    await expect(failFooterRes.json()).resolves.toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });
  });

  it.each([
    ['raw <', { custom_css: 'body { content: "<"; }' }],
    ['closing style tag', { custom_css: '</style><script>alert(1)</script>' }],
    ['hex-escaped <', { custom_css: '\\3c style>' }],
    ['@import', { custom_css: '@import url("https://evil.test/x.css");' }],
    ['comment-split @/**/import', { custom_css: '@/**/import "https://evil.test/x.css";' }],
    ['hex-escaped @import', { custom_css: '\\40 import "https://evil.test/x.css";' }],
    ['javascript:', { custom_css: 'a { background: url(javascript:alert(1)); }' }],
    ['vbscript:', { custom_css: 'a { background: url(vbscript:msgbox(1)); }' }],
    ['data:text/html', { custom_css: 'a { background: url(data:text/html,<script>1</script>); }' }],
    ['expression(', { custom_css: 'div { width: expression(alert(1)); }' }],
    ['comment-obfuscated expression(', { custom_css: 'div { width: exp/*x*/ression(alert(1)); }' }],
    ['-moz-binding', { custom_css: 'div { -moz-binding: url(x.xml#xss); }' }],
    ['behavior:', { custom_css: 'div { behavior: url(xss.htc); }' }],
    ['NUL control char in custom_css', { custom_css: 'body { color: red\u0000; }' }],
    ['BEL control char in custom_css', { custom_css: 'body { color: red\u0007; }' }],
    ['newline in footer_text', { footer_text: 'line1\nline2' }],
    ['carriage return in footer_text', { footer_text: 'line1\rline2' }],
    ['NUL in footer_text', { footer_text: 'bad\u0000footer' }],
    ['unknown theme_config key', { unknown_key: true }],
    ['non-boolean footer_hidden string', { footer_hidden: 'true' }],
    ['non-boolean footer_hidden number', { footer_hidden: 1 }],
  ])('rejects %s with 400 INVALID_ARGUMENT and zero DB writes', async (_label, invalidThemeConfig) => {
    const emptyDbBindings = env([]);

    const postRes = await postStatusPage(app(), emptyDbBindings, {
      slug: 'alpha',
      name: 'Alpha',
      title: 'Alpha',
      theme_config: invalidThemeConfig,
    });
    expect(postRes.status).toBe(400);
    await expect(postRes.json()).resolves.toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });

    const patchRes = await patchStatusPage(app(), emptyDbBindings, 4, {
      theme_config: invalidThemeConfig,
    });
    expect(patchRes.status).toBe(400);
    await expect(patchRes.json()).resolves.toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });
  });

  it('rejects non-object theme_config values with 400 INVALID_ARGUMENT and zero DB writes', async () => {
    for (const invalidValue of ['bad', 123, ['array']]) {
      const res = await postStatusPage(app(), env([]), {
        slug: 'alpha',
        name: 'Alpha',
        title: 'Alpha',
        theme_config: invalidValue,
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });
    }
  });
});
