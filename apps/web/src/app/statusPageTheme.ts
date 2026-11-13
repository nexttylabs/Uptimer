import * as React from 'react';

import type {
  PublicHomepageResponse,
  StatusPageThemeConfig,
  StatusResponse,
} from '../api/types';

export const STATUS_PAGE_CUSTOM_CSS_STYLE_ID = 'uptimer-status-page-custom-css';
const CUSTOM_CSS_MAX_LENGTH = 16_384;

function hasDisallowedCssControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === 0x7f) return true;
    if (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      return true;
    }
  }
  return false;
}

const UNSAFE_CSS_PATTERNS: RegExp[] = [
  /</,
  /@import/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /expression\s*\(/i,
  /-moz-binding/i,
  /behavior\s*:/i,
];

export const DEFAULT_STATUS_PAGE_THEME_CONFIG: StatusPageThemeConfig = {
  custom_css: null,
  footer_hidden: false,
  footer_text: null,
};

function unescapeCssForInspection(css: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '');
  return withoutComments
    .replace(/\\(?:\r\n|[\r\n\f])/g, '')
    .replace(
      /\\([0-9a-fA-F]{1,6})[ \t\r\n\f]?|\\([^\r\n\f0-9a-fA-F])/g,
      (_, hex: string | undefined, escapedChar: string | undefined) => {
        if (hex !== undefined) {
          const codePoint = Number.parseInt(hex, 16);
          if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
            return '\uFFFD';
          }
          return String.fromCodePoint(codePoint);
        }
        return escapedChar ?? '';
      },
    );
}

/**
 * Client-side defense-in-depth validation for status-page custom CSS.
 * Mirrors the Worker's rules so malformed or unsafe CSS is never mounted.
 */
export function sanitizeStatusPageCustomCss(css: string | null | undefined): string | null {
  if (typeof css !== 'string') return null;
  const trimmed = css.trim();
  if (trimmed.length === 0 || trimmed.length > CUSTOM_CSS_MAX_LENGTH) return null;
  if (hasDisallowedCssControlChar(trimmed)) return null;
  if (trimmed.includes('<')) return null;
  const inspected = unescapeCssForInspection(trimmed);
  for (const pattern of UNSAFE_CSS_PATTERNS) {
    if (pattern.test(inspected)) return null;
  }
  return trimmed;
}

export interface StyleElementLike {
  id: string;
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  remove(): void;
}

export interface StyleHeadLike {
  querySelector(selector: string): StyleElementLike | null;
  appendChild(node: StyleElementLike): void;
  ownerDocument?: { createElement(tagName: string): StyleElementLike } | null;
}

export function removeStatusPageCustomCss(head: StyleHeadLike | null | undefined): void {
  head?.querySelector(`#${STATUS_PAGE_CUSTOM_CSS_STYLE_ID}`)?.remove();
}

export function syncStatusPageCustomCss(
  head: StyleHeadLike | null | undefined,
  pageKey: string,
  customCss: string | null | undefined,
): StyleElementLike | null {
  if (!head) return null;
  const safeCss = sanitizeStatusPageCustomCss(customCss);
  const existing = head.querySelector(`#${STATUS_PAGE_CUSTOM_CSS_STYLE_ID}`);
  if (safeCss === null) {
    existing?.remove();
    return null;
  }

  const styleEl =
    existing ??
    head.ownerDocument?.createElement('style') ??
    (typeof document !== 'undefined' ? document.createElement('style') : null);
  if (!styleEl) return null;

  styleEl.id = STATUS_PAGE_CUSTOM_CSS_STYLE_ID;
  styleEl.setAttribute('data-status-page', pageKey);
  styleEl.textContent = safeCss;
  if (!existing) {
    head.appendChild(styleEl);
  }
  return styleEl;
}

export function useApplyStatusPageCustomCss(
  customCss: string | null | undefined,
  pageKey: string,
): void {
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const head = document.head as unknown as StyleHeadLike;
    syncStatusPageCustomCss(head, pageKey, customCss);
    return () => {
      removeStatusPageCustomCss(head);
    };
  }, [customCss, pageKey]);
}

export function resolveStatusPageFooter(
  themeConfig: StatusPageThemeConfig | null | undefined,
  defaultPoweredByText: string,
): { visible: boolean; text: string } {
  if (themeConfig?.footer_hidden) {
    return { visible: false, text: '' };
  }
  const customText = themeConfig?.footer_text?.trim() ?? '';
  if (customText.length > 0) {
    return { visible: true, text: customText };
  }
  return { visible: true, text: defaultPoweredByText };
}

function toHeartbeatStatusCode(status: StatusResponse['monitors'][number]['heartbeats'][number]['status']): string {
  switch (status) {
    case 'up':
      return 'u';
    case 'down':
      return 'd';
    case 'maintenance':
      return 'm';
    case 'unknown':
    default:
      return 'x';
  }
}

export function homepageFromStatus(status: StatusResponse): PublicHomepageResponse {
  return {
    generated_at: status.generated_at,
    bootstrap_mode: 'full',
    monitor_count_total: status.monitors.length,
    site_title: status.site_title,
    site_description: status.site_description,
    logo_url: status.logo_url,
    theme_config: status.theme_config ?? { ...DEFAULT_STATUS_PAGE_THEME_CONFIG },
    site_locale: status.site_locale,
    site_timezone: status.site_timezone,
    uptime_rating_level: status.uptime_rating_level,
    overall_status: status.overall_status,
    banner: status.banner,
    summary: status.summary,
    monitors: status.monitors.map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      type: monitor.type,
      display_url: monitor.display_url ?? null,
      group_name: monitor.group_name,
      status: monitor.status,
      is_stale: monitor.is_stale,
      last_checked_at: monitor.last_checked_at,
      heartbeat_strip: {
        checked_at: monitor.heartbeats.map((heartbeat) => heartbeat.checked_at),
        status_codes: monitor.heartbeats
          .map((heartbeat) => toHeartbeatStatusCode(heartbeat.status))
          .join(''),
        latency_ms: monitor.heartbeats.map((heartbeat) => heartbeat.latency_ms),
      },
      uptime_30d: monitor.uptime_30d ? { uptime_pct: monitor.uptime_30d.uptime_pct } : null,
      uptime_day_strip: {
        day_start_at: monitor.uptime_days.map((day) => day.day_start_at),
        downtime_sec: monitor.uptime_days.map((day) => day.downtime_sec),
        unknown_sec: monitor.uptime_days.map((day) => day.unknown_sec),
        uptime_pct_milli: monitor.uptime_days.map((day) =>
          day.uptime_pct === null ? null : Math.round(day.uptime_pct * 1000),
        ),
      },
    })),
    active_incidents: status.active_incidents.map((incident) => ({
      id: incident.id,
      title: incident.title,
      status: incident.status,
      impact: incident.impact,
      message: incident.message,
      started_at: incident.started_at,
      resolved_at: incident.resolved_at,
    })),
    maintenance_windows: {
      active: status.maintenance_windows.active.map((window) => ({
        id: window.id,
        title: window.title,
        message: window.message,
        starts_at: window.starts_at,
        ends_at: window.ends_at,
        monitor_ids: window.monitor_ids,
      })),
      upcoming: status.maintenance_windows.upcoming.map((window) => ({
        id: window.id,
        title: window.title,
        message: window.message,
        starts_at: window.starts_at,
        ends_at: window.ends_at,
        monitor_ids: window.monitor_ids,
      })),
    },
    resolved_incident_preview: null,
    maintenance_history_preview: null,
  };
}
