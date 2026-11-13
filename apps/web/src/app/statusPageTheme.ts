import { useEffect } from 'react';

import type { StatusPageThemeConfig } from '../api/types';

export const STATUS_PAGE_CUSTOM_CSS_STYLE_ID = 'uptimer-status-page-custom-css';
export const CUSTOM_CSS_MAX_LENGTH = 16384;

export const DEFAULT_STATUS_PAGE_THEME_CONFIG: StatusPageThemeConfig = {
  custom_css: null,
  footer_hidden: false,
  footer_text: null,
};

const CSS_COMMENT_RE = /\/\*[\s\S]*?(?:\*\/|$)/g;
const CSS_ESCAPE_RE =
  /\\(?:(\r\n|[\n\r\f])|([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?|([^\r\n\f0-9a-fA-F]))/g;
const UNSAFE_CSS_PATTERNS = [
  /@import/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /expression\s*\(/i,
  /-moz-binding/i,
  /behavior\s*:/i,
];

function hasDisallowedCssControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      return true;
    }
  }
  return false;
}

export interface StyleElementLike {
  id: string;
  textContent: string | null;
  parentNode: unknown;
  setAttribute(name: string, value: string): void;
  remove?(): void;
}

export interface HeadElementLike {
  appendChild(node: StyleElementLike): unknown;
  removeChild?(node: StyleElementLike): unknown;
}

export interface ThemeDocumentLike {
  head: HeadElementLike | null;
  getElementById(id: string): StyleElementLike | null;
  createElement(tagName: string): StyleElementLike;
}

function decodeCssEscapesSinglePass(cssWithoutComments: string): string {
  return cssWithoutComments.replace(
    CSS_ESCAPE_RE,
    (
      _match,
      newlineEscape: string | undefined,
      hex: string | undefined,
      literal: string | undefined,
    ) => {
      if (newlineEscape !== undefined) {
        return '';
      }
      if (hex !== undefined) {
        const codePoint = Number.parseInt(hex, 16);
        if (
          !Number.isFinite(codePoint) ||
          codePoint === 0 ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return '\ufffd';
        }
        return String.fromCodePoint(codePoint);
      }
      return literal ?? '';
    },
  );
}

export function sanitizeStatusPageCustomCss(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > CUSTOM_CSS_MAX_LENGTH) {
    return null;
  }
  if (hasDisallowedCssControlChar(trimmed) || trimmed.includes('<')) {
    return null;
  }
  const withoutComments = trimmed.replace(CSS_COMMENT_RE, '');
  const decoded = decodeCssEscapesSinglePass(withoutComments);
  if (decoded.includes('<') || UNSAFE_CSS_PATTERNS.some((pattern) => pattern.test(decoded))) {
    return null;
  }
  return trimmed;
}

export function removeStyleElement(el: StyleElementLike, head: HeadElementLike | null): void {
  if (typeof el.remove === 'function') {
    el.remove();
    return;
  }
  if (head && typeof head.removeChild === 'function') {
    head.removeChild(el);
  }
}

export function syncStatusPageCustomCss(
  rawCss: string | null | undefined,
  pageSlug: string | undefined,
  doc: ThemeDocumentLike | null | undefined = typeof document === 'undefined'
    ? null
    : (document as unknown as ThemeDocumentLike),
): void {
  if (!doc?.head) {
    return;
  }

  const safeCss = sanitizeStatusPageCustomCss(rawCss);
  const existing = doc.getElementById(STATUS_PAGE_CUSTOM_CSS_STYLE_ID);
  if (safeCss === null) {
    if (existing) {
      removeStyleElement(existing, doc.head);
    }
    return;
  }

  const styleEl = existing ?? doc.createElement('style');
  styleEl.id = STATUS_PAGE_CUSTOM_CSS_STYLE_ID;
  styleEl.setAttribute('data-status-page', pageSlug ?? 'default');
  styleEl.textContent = safeCss;
  if (!existing || styleEl.parentNode !== doc.head) {
    doc.head.appendChild(styleEl);
  }
}

export function useApplyStatusPageCustomCss(
  customCss: string | null | undefined,
  pageSlug: string | undefined,
  doc?: ThemeDocumentLike | null,
): void {
  useEffect(() => {
    syncStatusPageCustomCss(customCss, pageSlug, doc);
    return () => {
      syncStatusPageCustomCss(null, pageSlug, doc);
    };
  }, [customCss, pageSlug, doc]);
}

export function resolveStatusPageThemeConfig(
  themeConfig: StatusPageThemeConfig | null | undefined,
): StatusPageThemeConfig {
  if (!themeConfig) {
    return { ...DEFAULT_STATUS_PAGE_THEME_CONFIG };
  }
  return {
    custom_css: themeConfig.custom_css ?? null,
    footer_hidden: themeConfig.footer_hidden ?? false,
    footer_text: themeConfig.footer_text ?? null,
  };
}

export type ResolvedStatusPageFooter =
  | { visible: false; text: null }
  | { visible: true; text: string };

export function resolveStatusPageFooter(
  themeConfig: StatusPageThemeConfig | null | undefined,
  fallbackText: string,
): ResolvedStatusPageFooter {
  if (themeConfig?.footer_hidden) {
    return { visible: false, text: null };
  }
  const customText = themeConfig?.footer_text?.trim();
  if (customText) {
    return { visible: true, text: customText };
  }
  return { visible: true, text: fallbackText };
}
