import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { StatusPage, StatusResponse } from '../api/types';
import { I18nProvider } from '../app/I18nContext';
import { homepageFromStatus, resolveStatusPageFooter } from '../app/statusPageTheme';
import { messages, supportedLocales } from '../i18n/messages';
import { StatusPageFooter } from '../pages/StatusPage';
import { buildThemeConfigPayload, StatusPageForm } from './StatusPageForm';

const NEW_I18N_KEYS = [
  'status_page_form.custom_css',
  'status_page_form.custom_css_placeholder',
  'status_page_form.custom_css_help',
  'status_page_form.footer_hidden',
  'status_page_form.footer_hidden_help',
  'status_page_form.footer_text',
  'status_page_form.footer_text_placeholder',
  'status_page_form.footer_text_help',
] as const;

describe('status page theme footer, Admin form, homepageFromStatus, and 5-locale i18n (A4)', () => {
  it('omits <footer> when footer_hidden is true, renders literal plain text, and falls back to Powered by {siteTitle}', () => {
    const hiddenHtml = renderToStaticMarkup(
      <StatusPageFooter
        themeConfig={{ custom_css: null, footer_hidden: true, footer_text: 'Ignored' }}
        defaultPoweredByText="Powered by Alpha"
      />,
    );
    expect(hiddenHtml).toBe('');
    expect(hiddenHtml).not.toContain('<footer');
    expect(hiddenHtml).not.toContain('Powered by');

    const customHtml = renderToStaticMarkup(
      <StatusPageFooter
        themeConfig={{ custom_css: null, footer_hidden: false, footer_text: 'Acme Status Ops' }}
        defaultPoweredByText="Powered by Alpha"
      />,
    );
    expect(customHtml).toContain('<footer');
    expect(customHtml).toContain('Acme Status Ops');
    expect(customHtml).not.toContain('Powered by Alpha');

    const fallbackHtml = renderToStaticMarkup(
      <StatusPageFooter
        themeConfig={{ custom_css: null, footer_hidden: false, footer_text: '   ' }}
        defaultPoweredByText="Powered by Alpha"
      />,
    );
    expect(fallbackHtml).toContain('<footer');
    expect(fallbackHtml).toContain('Powered by Alpha');
    expect(resolveStatusPageFooter(undefined, 'Powered by Default')).toEqual({
      visible: true,
      text: 'Powered by Default',
    });
  });

  it('escapes HTML-like footer_text strictly as plain text without executable elements', () => {
    for (const raw of ['<script>alert(1)</script>', '<img onerror=1>']) {
      const html = renderToStaticMarkup(
        <StatusPageFooter
          themeConfig={{ custom_css: null, footer_hidden: false, footer_text: raw }}
          defaultPoweredByText="Powered by Alpha"
        />,
      );
      expect(html).toContain('<footer');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;');
    }
  });

  it('renders StatusPageForm theme_config inputs, preserves draft values with error banner, and maps empty/whitespace to null', () => {
    const page: StatusPage = {
      id: 4,
      slug: 'alpha',
      name: 'Alpha',
      title: 'Alpha Status',
      description: 'Desc',
      custom_hostname: null,
      logo_url: null,
      theme_config: {
        custom_css: '.alpha { color: #0f172a; }',
        footer_hidden: true,
        footer_text: 'Alpha Footer',
      },
      is_public: true,
      monitor_ids: [],
      created_at: 1,
      updated_at: 1,
    };

    const html = renderToStaticMarkup(
      <I18nProvider>
        <StatusPageForm
          page={page}
          monitors={[]}
          error="INVALID_ARGUMENT: custom_css disallowed"
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain('INVALID_ARGUMENT: custom_css disallowed');
    expect(html).toContain('name="custom_css"');
    expect(html).toContain('.alpha { color: #0f172a; }');
    expect(html).toContain('name="footer_hidden"');
    expect(html).toContain('checked=""');
    expect(html).toContain('name="footer_text"');
    expect(html).toContain('value="Alpha Footer"');

    expect(
      buildThemeConfigPayload({
        customCss: '  body { color: red; }  ',
        footerHidden: true,
        footerText: '  Custom Footer  ',
      }),
    ).toEqual({
      custom_css: 'body { color: red; }',
      footer_hidden: true,
      footer_text: 'Custom Footer',
    });

    expect(
      buildThemeConfigPayload({
        customCss: '   ',
        footerHidden: false,
        footerText: '',
      }),
    ).toEqual({
      custom_css: null,
      footer_hidden: false,
      footer_text: null,
    });
  });

  it('copies theme_config in homepageFromStatus and defines all new keys across all 5 locales', () => {
    const status: StatusResponse = {
      generated_at: 1_750_000_000,
      site_title: 'Alpha',
      site_description: 'Desc',
      logo_url: null,
      theme_config: {
        custom_css: '.alpha { color: blue; }',
        footer_hidden: false,
        footer_text: 'Alpha Footer',
      },
      site_locale: 'en',
      site_timezone: 'UTC',
      uptime_rating_level: 4,
      overall_status: 'up',
      banner: { source: 'monitors', status: 'operational', title: 'All Systems Operational' },
      summary: { up: 1, down: 0, maintenance: 0, paused: 0, unknown: 0 },
      monitors: [],
      active_incidents: [],
      maintenance_windows: { active: [], upcoming: [] },
    };

    expect(homepageFromStatus(status).theme_config).toEqual(status.theme_config);

    for (const locale of supportedLocales) {
      const table = messages[locale];
      for (const key of NEW_I18N_KEYS) {
        const value = table[key];
        expect(typeof value).toBe('string');
        expect((value ?? '').trim().length).toBeGreaterThan(0);
      }
    }
  });
});
