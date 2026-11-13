import { describe, expect, it, vi } from 'vitest';

import {
  STATUS_PAGE_CUSTOM_CSS_STYLE_ID,
  sanitizeStatusPageCustomCss,
  syncStatusPageCustomCss,
  type HeadElementLike,
  type StyleElementLike,
  type ThemeDocumentLike,
} from './statusPageTheme';

function createFakeHeadDocument() {
  const nodes: Array<StyleElementLike & { attributes: Record<string, string> }> = [];
  let innerHtmlWrites = 0;

  const head: HeadElementLike = {
    appendChild(node) {
      const styleNode = node as StyleElementLike & { attributes: Record<string, string> };
      styleNode.parentNode = head;
      if (!nodes.includes(styleNode)) {
        nodes.push(styleNode);
      }
      return node;
    },
    removeChild(node) {
      const idx = nodes.indexOf(node as StyleElementLike & { attributes: Record<string, string> });
      if (idx >= 0) {
        nodes.splice(idx, 1);
      }
      node.parentNode = null;
      return node;
    },
  };

  const doc: ThemeDocumentLike = {
    head,
    getElementById(id) {
      return nodes.find((node) => node.id === id) ?? null;
    },
    createElement() {
      const attributes: Record<string, string> = {};
      const el: StyleElementLike & { attributes: Record<string, string> } = {
        id: '',
        textContent: null,
        parentNode: null,
        attributes,
        setAttribute(name, value) {
          attributes[name] = value;
        },
        remove() {
          head.removeChild?.(el);
        },
      };
      Object.defineProperty(el, 'innerHTML', {
        get: () => '',
        set: () => {
          innerHtmlWrites += 1;
          throw new Error('innerHTML must never be used to inject custom CSS');
        },
      });
      return el;
    },
  };

  return {
    doc,
    nodes,
    getInnerHtmlWrites: () => innerHtmlWrites,
  };
}

describe('statusPageTheme custom CSS mounting, switching, cleanup, and sanitization', () => {
  it('mounts <style id="uptimer-status-page-custom-css"> via textContent, switches cleanly across pages, and clears when data is loading or unmounted', () => {
    const fake = createFakeHeadDocument();

    syncStatusPageCustomCss('.alpha { color: #09f; }', 'alpha', fake.doc);
    expect(fake.nodes).toHaveLength(1);
    expect(fake.nodes[0]?.id).toBe(STATUS_PAGE_CUSTOM_CSS_STYLE_ID);
    expect(fake.nodes[0]?.attributes['data-status-page']).toBe('alpha');
    expect(fake.nodes[0]?.textContent).toBe('.alpha { color: #09f; }');
    expect(fake.getInnerHtmlWrites()).toBe(0);

    // Switching to page beta while beta's query is still loading (custom_css === undefined)
    // removes page alpha's style immediately.
    syncStatusPageCustomCss(undefined, 'beta', fake.doc);
    expect(fake.nodes).toHaveLength(0);

    // Applying page beta's CSS mounts beta's style isolated to data-status-page="beta".
    syncStatusPageCustomCss('  .beta { color: #10b981; }  ', 'beta', fake.doc);
    expect(fake.nodes).toHaveLength(1);
    expect(fake.nodes[0]?.attributes['data-status-page']).toBe('beta');
    expect(fake.nodes[0]?.textContent).toBe('.beta { color: #10b981; }');

    // Leaving to /admin (unmount / empty clear) removes the style element completely.
    syncStatusPageCustomCss(null, 'beta', fake.doc);
    expect(fake.nodes).toHaveLength(0);
  });

  it('rejects unsafe, oversized, and obfuscated CSS on the client as defense-in-depth and accepts valid boundaries', () => {
    const fake = createFakeHeadDocument();
    syncStatusPageCustomCss('.safe { color: black; }', 'alpha', fake.doc);
    expect(fake.nodes).toHaveLength(1);

    const badCssInputs = [
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
      'body { color: red\u007f; }',
    ];

    for (const bad of badCssInputs) {
      expect(sanitizeStatusPageCustomCss(bad)).toBeNull();
      syncStatusPageCustomCss(bad, 'alpha', fake.doc);
      expect(fake.nodes).toHaveLength(0);
    }

    const maxValid = `.a { content: "\\\\3c"; }\n${'a{}'.repeat(6000)}`.slice(0, 16384);
    expect(maxValid.length).toBe(16384);
    expect(sanitizeStatusPageCustomCss(`  ${maxValid}  `)).toBe(maxValid);
    expect(sanitizeStatusPageCustomCss('/* ok */ .a { content: "\\\\3c"; }')).toBe(
      '/* ok */ .a { content: "\\\\3c"; }',
    );
  });

  it('wires useApplyStatusPageCustomCss hook cleanup and public route components cleanly', async () => {
    vi.resetModules();
    const cleanups: Array<() => void> = [];
    const syncCalls: Array<{ css: string | null | undefined; slug: string | undefined }> = [];

    const docRef = createFakeHeadDocument();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: docRef.doc,
    });

    vi.doMock('react', async () => {
      const actual = await vi.importActual<typeof import('react')>('react');
      return {
        ...actual,
        useEffect(effect: () => void | (() => void)) {
          const cleanup = effect();
          if (typeof cleanup === 'function') {
            cleanups.push(cleanup);
          }
        },
      };
    });

    const themeModule = await import('./statusPageTheme');
    themeModule.useApplyStatusPageCustomCss('.live { opacity: 0.9; }', 'ops');
    expect(docRef.nodes).toHaveLength(1);
    expect(docRef.nodes[0]?.textContent).toBe('.live { opacity: 0.9; }');
    expect(docRef.nodes[0]?.attributes['data-status-page']).toBe('ops');

    // Running cleanup simulates navigating away to /admin or unmounting while next page loads.
    for (const cleanup of cleanups) {
      cleanup();
    }
    expect(docRef.nodes).toHaveLength(0);

    vi.doUnmock('react');
    vi.resetModules();

    // Verify IncidentHistoryPage, MaintenanceHistoryPage, and StatusPage all pass their query's custom_css and slug to useApplyStatusPageCustomCss.
    vi.doMock('../app/statusPageTheme', async () => {
      const actual = await vi.importActual<typeof import('./statusPageTheme')>('./statusPageTheme');
      return {
        ...actual,
        useApplyStatusPageCustomCss(css: string | null | undefined, pageSlug: string | undefined) {
          syncCalls.push({ css, slug: pageSlug });
        },
      };
    });
    vi.doMock('../app/I18nContext', () => ({
      useI18n: () => ({ locale: 'en', t: (k: string) => k }),
    }));
    vi.doMock('../app/useApplyServerLocaleSetting', () => ({
      useApplyServerLocaleSetting: () => undefined,
    }));
    vi.doMock('../app/StatusPageSlugContext', () => ({
      useStatusPageSlug: () => 'custom-slug',
    }));
    vi.doMock('@tanstack/react-query', () => ({
      useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) => {
        if (enabled === false) {
          return { isLoading: false, isError: false, data: undefined };
        }
        if (queryKey[0] === 'homepage' || queryKey[0] === 'status') {
          return {
            isLoading: false,
            isError: false,
            data: {
              site_title: 'Custom Page',
              site_description: '',
              site_locale: 'en',
              site_timezone: 'UTC',
              theme_config: {
                custom_css: '.scoped { color: purple; }',
                footer_hidden: false,
                footer_text: null,
              },
              overall_status: 'up',
              banner: { source: 'monitors', status: 'operational', title: 'OK' },
              monitors: [],
              active_incidents: [],
              maintenance_windows: { active: [], upcoming: [] },
              resolved_incident_preview: null,
              maintenance_history_preview: null,
              generated_at: 100,
              bootstrap_mode: 'full',
              monitor_count_total: 0,
              logo_url: null,
              uptime_rating_level: 3,
              summary: { up: 0, down: 0, maintenance: 0, paused: 0, unknown: 0 },
            },
          };
        }
        return { isLoading: false, isError: false, data: { incidents: [], maintenance_windows: [], next_cursor: null } };
      },
    }));
    vi.doMock('react-router-dom', () => ({
      Link: ({ children }: { children: unknown }) => children,
    }));
    vi.doMock('../components/ui', () => ({
      Badge: () => null,
      Button: () => null,
      Card: () => null,
      MODAL_OVERLAY_CLASS: '',
      MODAL_PANEL_CLASS: '',
      ThemeToggle: () => null,
    }));
    vi.doMock('../components/Markdown', () => ({ Markdown: () => null }));
    vi.doMock('../components/MonitorCard', () => ({ MonitorCard: () => null }));
    vi.doMock('../components/DayDowntimeModal', () => ({ DayDowntimeModal: () => null }));

    const ReactDOMServer = await import('react-dom/server');
    const React = await import('react');
    const { StatusPage } = await import('../pages/StatusPage');
    const { IncidentHistoryPage } = await import('../pages/IncidentHistoryPage');
    const { MaintenanceHistoryPage } = await import('../pages/MaintenanceHistoryPage');

    ReactDOMServer.renderToStaticMarkup(React.createElement(StatusPage));
    ReactDOMServer.renderToStaticMarkup(React.createElement(IncidentHistoryPage));
    ReactDOMServer.renderToStaticMarkup(React.createElement(MaintenanceHistoryPage));

    expect(syncCalls).toEqual([
      { css: '.scoped { color: purple; }', slug: 'custom-slug' },
      { css: '.scoped { color: purple; }', slug: 'custom-slug' },
      { css: '.scoped { color: purple; }', slug: 'custom-slug' },
    ]);

    vi.doUnmock('../app/statusPageTheme');
    vi.doUnmock('../app/I18nContext');
    vi.doUnmock('../app/useApplyServerLocaleSetting');
    vi.doUnmock('../app/StatusPageSlugContext');
    vi.doUnmock('@tanstack/react-query');
    vi.doUnmock('react-router-dom');
    vi.doUnmock('../components/ui');
    vi.doUnmock('../components/Markdown');
    vi.doUnmock('../components/MonitorCard');
    vi.doUnmock('../components/DayDowntimeModal');
    delete (globalThis as { document?: unknown }).document;
  });
});
