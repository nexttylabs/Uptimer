import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../app/I18nContext';
import {
  DEFAULT_STATUS_PAGE_THEME_CONFIG,
  resolveStatusPageFooter,
  resolveStatusPageThemeConfig,
} from '../app/statusPageTheme';
import {
  buildStatusPageThemeConfigInput,
  StatusPageForm,
} from './StatusPageForm';
import { messages } from '../i18n/messages';
import { StatusPageFooter } from '../pages/StatusPage';

describe('status page theme & footer UI (A4)', () => {
  it('hides footer completely when footer_hidden is true, renders literal escaped plain-text footer_text, and falls back to default', () => {
    expect(
      resolveStatusPageFooter(
        {
          custom_css: null,
          footer_hidden: true,
          footer_text: 'Should remain hidden',
        },
        'Powered by Acme Status',
      ),
    ).toEqual({ visible: false, text: null });

    const hiddenHtml = renderToStaticMarkup(
      <StatusPageFooter
        themeConfig={{
          custom_css: null,
          footer_hidden: true,
          footer_text: 'Should remain hidden',
        }}
        fallbackText="Powered by Acme Status"
      />,
    );
    expect(hiddenHtml).toBe('');

    const escapedTextHtml = renderToStaticMarkup(
      <StatusPageFooter
        themeConfig={{
          custom_css: null,
          footer_hidden: false,
          footer_text: '  Ops <script>alert(1)</script> Team  ',
        }}
        fallbackText="Powered by Acme Status"
      />,
    );
    expect(escapedTextHtml).toContain('<footer');
    expect(escapedTextHtml).toContain('Ops &lt;script&gt;alert(1)&lt;/script&gt; Team');
    expect(escapedTextHtml).not.toContain('<script>');

    const defaultFooterHtml = renderToStaticMarkup(
      <StatusPageFooter
        themeConfig={{
          custom_css: '.x {}',
          footer_hidden: false,
          footer_text: null,
        }}
        fallbackText="Powered by Acme Status"
      />,
    );
    expect(defaultFooterHtml).toContain('Powered by Acme Status');
  });

  it('renders StatusPageForm theme controls, preserves error/draft state, and maps clear/create/patch payloads cleanly', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <StatusPageForm
          page={{
            id: 4,
            slug: 'partners',
            name: 'Partners',
            title: 'Partner Status',
            description: 'External partner services',
            custom_hostname: null,
            logo_url: null,
            theme_config: {
              custom_css: 'body { color: #111; }',
              footer_hidden: false,
              footer_text: 'Partner Ops',
            },
            is_public: true,
            monitor_ids: [],
            created_at: 100,
            updated_at: 100,
          }}
          monitors={[]}
          error="INVALID_ARGUMENT: unsafe CSS"
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain('Custom CSS');
    expect(html).toContain('body { color: #111; }');
    expect(html).toContain('Hide Footer');
    expect(html).toContain('Custom Footer Text');
    expect(html).toContain('Partner Ops');
    expect(html).toContain('INVALID_ARGUMENT: unsafe CSS');

    expect(
      buildStatusPageThemeConfigInput({
        customCss: '  .card { border-radius: 12px; }  ',
        footerHidden: false,
        footerText: '  Acme Ops  ',
      }),
    ).toEqual({
      custom_css: '.card { border-radius: 12px; }',
      footer_hidden: false,
      footer_text: 'Acme Ops',
    });

    expect(
      buildStatusPageThemeConfigInput({
        customCss: '   \n ',
        footerHidden: true,
        footerText: '   ',
      }),
    ).toEqual({
      custom_css: null,
      footer_hidden: true,
      footer_text: null,
    });

    expect(resolveStatusPageThemeConfig(undefined)).toEqual(DEFAULT_STATUS_PAGE_THEME_CONFIG);
    expect(
      resolveStatusPageThemeConfig({
        custom_css: '.a{}',
        footer_hidden: true,
        footer_text: 'Custom',
      }),
    ).toEqual({
      custom_css: '.a{}',
      footer_hidden: true,
      footer_text: 'Custom',
    });
  });

  it('defines all new status_page_form theme keys across all 5 supported locales', () => {
    const requiredKeys = [
      'status_page_form.custom_css',
      'status_page_form.custom_css_placeholder',
      'status_page_form.custom_css_help',
      'status_page_form.footer_hidden',
      'status_page_form.footer_hidden_help',
      'status_page_form.footer_text',
      'status_page_form.footer_text_placeholder',
      'status_page_form.footer_text_help',
    ] as const;

    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ja', 'es'] as const) {
      for (const key of requiredKeys) {
        expect(messages[locale][key]?.trim().length, `${locale}:${key}`).toBeGreaterThan(0);
      }
    }
  });
});
