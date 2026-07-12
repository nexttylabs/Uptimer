import { afterEach, describe, expect, it, vi } from 'vitest';

import pageWorker from '../../web/public/_worker.js';

type CacheMatcher = (request: Request) => Response | undefined;

function installDefaultCacheMock(
  match: CacheMatcher,
  opts: { putImpl?: (request: Request, response: Response) => Promise<void> | void } = {},
) {
  const put = vi.fn(async (request: Request, response: Response) => {
    await opts.putImpl?.(request, response);
  });

  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      default: {
        async match(request: Request) {
          return match(request)?.clone();
        },
        put,
      },
    },
  });

  return { put };
}

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    ASSETS: {
      fetch: vi.fn(async () =>
        new Response('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
          status: 200,
        }),
      ),
    },
    UPTIMER_API_ORIGIN: 'https://api.example.com',
    ...overrides,
  };
}

const PARTNERS_PAGE = {
  id: 4,
  slug: 'partners',
  name: 'Partners',
  title: 'Partner status',
  description: 'Partner services',
  custom_hostname: 'status.partners.com',
};

describe('pages custom-host routing', () => {
  const originalCaches = (globalThis as { caches?: unknown }).caches;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalCaches === undefined) {
      delete (globalThis as { caches?: unknown }).caches;
    } else {
      Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches });
    }
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('preserves legacy behavior when UPTIMER_DEFAULT_HOSTS is absent', async () => {
    installDefaultCacheMock(() => undefined);
    const env = makeEnv(); // no UPTIMER_DEFAULT_HOSTS
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          generated_at: 1_728_000_000,
          preload_html: '<div id="uptimer-preload"></div>',
          snapshot_json: JSON.stringify({ site_title: 'Uptimer' }),
          meta_title: 'Uptimer',
          meta_description: '',
        }),
        { status: 200 },
      ),
    ) as never;

    const res = await pageWorker.fetch(
      new Request('https://anything.example.com/', { headers: { Accept: 'text/html' } }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(200);
    // No host resolution fetch was made; only the homepage artifact fetch.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('resolves a custom host to its bound status page', async () => {
    installDefaultCacheMock(() => undefined);
    const env = makeEnv({ UPTIMER_DEFAULT_HOSTS: 'default.example.com' });
    const fetchCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push(url);
      if (url.includes('/resolve-host')) {
        return new Response(JSON.stringify(PARTNERS_PAGE), { status: 200 });
      }
      // slug-scoped status endpoint
      return new Response(
        JSON.stringify({ generated_at: 1_728_000_000, site_title: 'Partner status', site_description: 'Partner services' }),
        { status: 200 },
      );
    }) as never;

    const res = await pageWorker.fetch(
      new Request('https://status.partners.com/', { headers: { Accept: 'text/html' } }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const html = await res.text();
    // Bootstrap slug injected so SPA reuses slug-qualified API paths.
    expect(html).toContain('__UPTIMER_STATUS_PAGE_SLUG__');
    expect(html).toContain('"partners"');
    // Host resolution happened before any artifact fetch.
    expect(fetchCalls[0]).toContain('/resolve-host?host=status.partners.com');
    // Artifact fetch used the slug-scoped status endpoint.
    expect(fetchCalls.some((u) => u.includes('/status-pages/partners/status'))).toBe(true);
  });

  it('fails closed with no-store 404 for an unknown host', async () => {
    installDefaultCacheMock(() => undefined);
    const env = makeEnv({ UPTIMER_DEFAULT_HOSTS: 'default.example.com' });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/resolve-host')) {
        return new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), { status: 404 });
      }
      return new Response('', { status: 200 });
    }) as never;

    const res = await pageWorker.fetch(
      new Request('https://unknown.example.com/', { headers: { Accept: 'text/html' } }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('preserves default-host behavior when host is in UPTIMER_DEFAULT_HOSTS', async () => {
    installDefaultCacheMock(() => undefined);
    const env = makeEnv({ UPTIMER_DEFAULT_HOSTS: 'default.example.com' });
    const fetchCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push(url);
      return new Response(
        JSON.stringify({ generated_at: 1_728_000_000, preload_html: '', snapshot_json: '{}', meta_title: 'Uptimer', meta_description: '' }),
        { status: 200 },
      );
    }) as never;

    const res = await pageWorker.fetch(
      new Request('https://default.example.com/', { headers: { Accept: 'text/html' } }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(200);
    // No host resolution; went straight to the default homepage artifact.
    expect(fetchCalls.every((u) => !u.includes('/resolve-host'))).toBe(true);
  });

  it('rejects a conflicting /status/:other-slug on a custom host', async () => {
    installDefaultCacheMock(() => undefined);
    const env = makeEnv({ UPTIMER_DEFAULT_HOSTS: 'default.example.com' });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/resolve-host')) {
        return new Response(JSON.stringify(PARTNERS_PAGE), { status: 200 });
      }
      return new Response('', { status: 200 });
    }) as never;

    const res = await pageWorker.fetch(
      new Request('https://status.partners.com/status/other-slug', { headers: { Accept: 'text/html' } }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rewrites unscoped public API paths to slug-scoped on a custom host', async () => {
    installDefaultCacheMock(() => undefined);
    const env = makeEnv({ UPTIMER_DEFAULT_HOSTS: 'default.example.com' });
    const fetchCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push(url);
      if (url.includes('/resolve-host')) {
        return new Response(JSON.stringify(PARTNERS_PAGE), { status: 200 });
      }
      return new Response(JSON.stringify({ monitors: [] }), { status: 200 });
    }) as never;

    const res = await pageWorker.fetch(
      new Request('https://status.partners.com/api/v1/public/status'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(200);
    // The unscoped /public/status was rewritten to /status-pages/partners/status.
    expect(fetchCalls.some((u) => u.includes('/status-pages/partners/status'))).toBe(true);
  });

  it('blocks Admin API on a custom host', async () => {
    installDefaultCacheMock(() => undefined);
    const env = makeEnv({ UPTIMER_DEFAULT_HOSTS: 'default.example.com' });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/resolve-host')) {
        return new Response(JSON.stringify(PARTNERS_PAGE), { status: 200 });
      }
      return new Response('', { status: 200 });
    }) as never;

    const res = await pageWorker.fetch(
      new Request('https://status.partners.com/api/v1/admin/monitors'),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('qualifies HTML cache key with host so page A cannot leak to page B', async () => {
    const putCalls: Request[] = [];
    installDefaultCacheMock(() => undefined, {
      putImpl: (request: Request) => {
        putCalls.push(request);
      },
    });
    const env = makeEnv({ UPTIMER_DEFAULT_HOSTS: 'default.example.com' });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/resolve-host')) {
        return new Response(JSON.stringify(PARTNERS_PAGE), { status: 200 });
      }
      return new Response(
        JSON.stringify({ generated_at: 1_728_000_000, site_title: 'Partner status', site_description: '' }),
        { status: 200 },
      );
    }) as never;

    await pageWorker.fetch(
      new Request('https://status.partners.com/', { headers: { Accept: 'text/html' } }),
      env,
      { waitUntil: vi.fn((p: Promise<unknown>) => p) } as unknown as ExecutionContext,
    );

    expect(putCalls).toHaveLength(1);
    // The cache key includes the host so it cannot collide with another page's entry.
    expect(putCalls[0].url).toContain('status.partners.com');
    expect(putCalls[0].url).toContain('|host:status.partners.com');
  });

  it('uses the custom hostname as canonical and og:url', async () => {
    installDefaultCacheMock(() => undefined);
    const env = makeEnv({ UPTIMER_DEFAULT_HOSTS: 'default.example.com' });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/resolve-host')) {
        return new Response(JSON.stringify(PARTNERS_PAGE), { status: 200 });
      }
      return new Response(
        JSON.stringify({ generated_at: 1_728_000_000, site_title: 'Partner status', site_description: 'Partner services' }),
        { status: 200 },
      );
    }) as never;

    const res = await pageWorker.fetch(
      new Request('https://status.partners.com/', { headers: { Accept: 'text/html' } }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

    const html = await res.text();
    expect(html).toContain('<link rel="canonical" href="https://status.partners.com/"');
    expect(html).toContain('og:url" content="https://status.partners.com/"');
    expect(html).toContain('Partner status');
  });

  it('warms two hostnames in both orders and each resolves to its assigned slug', async () => {
    const ALPHA_PAGE = { ...PARTNERS_PAGE, slug: 'alpha', custom_hostname: 'status.alpha.com', title: 'Alpha status' };
    const BETA_PAGE = { ...PARTNERS_PAGE, slug: 'beta', custom_hostname: 'status.beta.com', title: 'Beta status' };

    for (const order of [['alpha', 'beta'], ['beta', 'alpha']] as const) {
      installDefaultCacheMock(() => undefined);
      const env = makeEnv({ UPTIMER_DEFAULT_HOSTS: 'default.example.com' });
      const resolvedSlugs: string[] = [];
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/resolve-host')) {
          const host = new URL(url).searchParams.get('host');
          const page = host === 'status.alpha.com' ? ALPHA_PAGE : host === 'status.beta.com' ? BETA_PAGE : null;
          if (!page) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), { status: 404 });
          resolvedSlugs.push(page.slug);
          return new Response(JSON.stringify(page), { status: 200 });
        }
        return new Response(
          JSON.stringify({ generated_at: 1_728_000_000, site_title: 'Resolved', site_description: '' }),
          { status: 200 },
        );
      }) as never;

      for (const which of order) {
        const hostname = which === 'alpha' ? 'status.alpha.com' : 'status.beta.com';
        const expectedSlug = which === 'alpha' ? 'alpha' : 'beta';
        const res = await pageWorker.fetch(
          new Request(`https://${hostname}/`, { headers: { Accept: 'text/html' } }),
          env,
          { waitUntil: vi.fn() } as unknown as ExecutionContext,
        );
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain(`__UPTIMER_STATUS_PAGE_SLUG__="${expectedSlug}"`);
      }
    }
  });

  it('ignores X-Forwarded-Host and uses only the request Host for ownership', async () => {
    installDefaultCacheMock(() => undefined);
    const env = makeEnv({ UPTIMER_DEFAULT_HOSTS: 'default.example.com' });
    let resolvedHost: string | null = null;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/resolve-host')) {
        resolvedHost = new URL(url).searchParams.get('host');
        return new Response(JSON.stringify(PARTNERS_PAGE), { status: 200 });
      }
      return new Response(
        JSON.stringify({ generated_at: 1_728_000_000, site_title: 'Partner status', site_description: '' }),
        { status: 200 },
      );
    }) as never;

    const req = new Request('https://status.partners.com/', { headers: { Accept: 'text/html' } });
    // Spoofed forwarding header must be ignored.
    req.headers.set('X-Forwarded-Host', 'evil.example.com');
    await pageWorker.fetch(req, env, { waitUntil: vi.fn() } as unknown as ExecutionContext);

    expect(resolvedHost).toBe('status.partners.com');
  });

  it('ignores query-string input that attempts to override Host ownership', async () => {
    installDefaultCacheMock(() => undefined);
    const env = makeEnv({ UPTIMER_DEFAULT_HOSTS: 'default.example.com' });
    let resolvedHost: string | null = null;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/resolve-host')) {
        resolvedHost = new URL(url).searchParams.get('host');
        return new Response(JSON.stringify(PARTNERS_PAGE), { status: 200 });
      }
      return new Response(
        JSON.stringify({ generated_at: 1_728_000_000, site_title: 'Partner status', site_description: '' }),
        { status: 200 },
      );
    }) as never;

    // Query string __status_page cannot override Host-resolved ownership.
    const res = await pageWorker.fetch(
      new Request('https://status.partners.com/?__status_page=evil-slug', { headers: { Accept: 'text/html' } }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );
    expect(res.status).toBe(200);
    expect(resolvedHost).toBe('status.partners.com');
    const html = await res.text();
    expect(html).toContain('__UPTIMER_STATUS_PAGE_SLUG__="partners"');
  });
});
