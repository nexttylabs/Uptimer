import { describe, expect, it } from 'vitest';

import {
  removeStatusPageCustomCss,
  sanitizeStatusPageCustomCss,
  STATUS_PAGE_CUSTOM_CSS_STYLE_ID,
  syncStatusPageCustomCss,
  type StyleElementLike,
  type StyleHeadLike,
} from './statusPageTheme';

function createFakeHead() {
  const nodes: Array<
    StyleElementLike & {
      attributes: Record<string, string>;
      innerHtmlWrites: number;
    }
  > = [];

  const head: StyleHeadLike = {
    querySelector(selector: string) {
      if (selector === `#${STATUS_PAGE_CUSTOM_CSS_STYLE_ID}`) {
        return nodes.find((n) => n.id === STATUS_PAGE_CUSTOM_CSS_STYLE_ID) ?? null;
      }
      return null;
    },
    appendChild(node) {
      nodes.push(node as (typeof nodes)[number]);
    },
    ownerDocument: {
      createElement(_tagName: string) {
        const el = {
          id: '',
          textContent: null as string | null,
          attributes: {} as Record<string, string>,
          innerHtmlWrites: 0,
          setAttribute(name: string, value: string) {
            el.attributes[name] = value;
          },
          remove() {
            const idx = nodes.indexOf(el);
            if (idx >= 0) nodes.splice(idx, 1);
          },
        };
        return el;
      },
    },
  };

  return {
    head,
    getNodes: () => nodes,
    getStyleNode: () => nodes.find((n) => n.id === STATUS_PAGE_CUSTOM_CSS_STYLE_ID) ?? null,
  };
}

describe('status page custom CSS route lifecycle and defense-in-depth (A3)', () => {
  it('mounts #uptimer-status-page-custom-css via textContent across main and history views, clears on slug switch while loading, and removes on /admin unmount', () => {
    const fake = createFakeHead();
    const alphaCss = '.status-header { border-bottom-color: #2563eb; }';
    const betaCss = '.status-header { border-bottom-color: #16a34a; }';

    // 1. /status/alpha mounts alpha CSS once with data-status-page="alpha".
    const mounted = syncStatusPageCustomCss(fake.head, 'alpha', alphaCss);
    expect(mounted).not.toBeNull();
    expect(fake.getNodes()).toHaveLength(1);
    expect(fake.getStyleNode()?.textContent).toBe(alphaCss);
    expect(fake.getStyleNode()?.attributes['data-status-page']).toBe('alpha');
    expect(fake.getStyleNode()?.innerHtmlWrites).toBe(0);

    // 2. /status/alpha/history/incidents and /status/alpha/history/maintenance retain alpha CSS in place.
    syncStatusPageCustomCss(fake.head, 'alpha', alphaCss);
    syncStatusPageCustomCss(fake.head, 'alpha', alphaCss);
    expect(fake.getNodes()).toHaveLength(1);
    expect(fake.getStyleNode()?.textContent).toBe(alphaCss);

    // 3. Switching to /status/beta while beta query data is still undefined clears alpha's CSS immediately.
    const clearedDuringLoad = syncStatusPageCustomCss(fake.head, 'beta', undefined);
    expect(clearedDuringLoad).toBeNull();
    expect(fake.getNodes()).toHaveLength(0);

    // 4. Once beta data resolves, beta CSS mounts cleanly.
    syncStatusPageCustomCss(fake.head, 'beta', betaCss);
    expect(fake.getNodes()).toHaveLength(1);
    expect(fake.getStyleNode()?.textContent).toBe(betaCss);
    expect(fake.getStyleNode()?.attributes['data-status-page']).toBe('beta');

    // 5. Navigating away to /admin unmounts and removes the style node completely.
    removeStatusPageCustomCss(fake.head);
    expect(fake.getNodes()).toHaveLength(0);
    expect(fake.getStyleNode()).toBeNull();
  });

  it('removes any existing style node when custom_css is empty, null, or undefined', () => {
    const fake = createFakeHead();
    syncStatusPageCustomCss(fake.head, 'alpha', 'body { color: #111; }');
    expect(fake.getNodes()).toHaveLength(1);

    syncStatusPageCustomCss(fake.head, 'alpha', null);
    expect(fake.getNodes()).toHaveLength(0);

    syncStatusPageCustomCss(fake.head, 'alpha', 'body { color: #222; }');
    syncStatusPageCustomCss(fake.head, 'alpha', '   ');
    expect(fake.getNodes()).toHaveLength(0);
  });

  it.each([
    ['closing style tag', '</style><script>alert(1)</script>'],
    ['raw <', 'body { content: "<"; }'],
    ['@import', '@import url("https://evil.test/a.css");'],
    ['javascript:', 'a { background: url(javascript:alert(1)); }'],
    ['expression(', 'div { width: expression(alert(1)); }'],
  ])('client defense-in-depth refuses %s and removes any prior style node', (_label, unsafeCss) => {
    const fake = createFakeHead();
    syncStatusPageCustomCss(fake.head, 'alpha', 'body { color: #111; }');
    expect(fake.getNodes()).toHaveLength(1);

    expect(sanitizeStatusPageCustomCss(unsafeCss)).toBeNull();
    const res = syncStatusPageCustomCss(fake.head, 'alpha', unsafeCss);
    expect(res).toBeNull();
    expect(fake.getNodes()).toHaveLength(0);
  });
});
