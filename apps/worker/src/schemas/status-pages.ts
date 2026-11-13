import { z } from 'zod';

const slugSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
// Empty array is valid: means "unlink all monitors from this page".
const idListSchema = z.array(z.number().int().positive()).max(500);

// ponytail: hostname is validated by parsing, not by hand-rolled regex. A bare
// hostname with no scheme parses under a synthetic http URL; anything with a
// scheme/path/port/wildcard/IP literal/localhost/punycode-failure is rejected.
const CUSTOM_HOSTNAME_MAX_LENGTH = 253;

const RESERVED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal', '.test', '.example', '.invalid'];
const RESERVED_HOSTNAME_EXACT = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
  'local',
  'internal',
]);

function isIpLiteral(hostname: string): boolean {
  // IPv4: dotted quad of 0-255.
  const v4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    return v4.slice(1).every((octet) => Number(octet) <= 255);
  }
  // IPv6: anything wrapped in brackets or containing a colon is treated as an IP literal.
  return hostname.startsWith('[') || hostname.includes(':');
}

export function normalizeCustomHostname(value: string): string | null {
  const trimmed = String(value ?? '').trim().toLowerCase().replace(/\.+$/, '');
  if (!trimmed || trimmed.length > CUSTOM_HOSTNAME_MAX_LENGTH) return null;

  // Reject anything that looks like a URL (scheme, path, query, fragment, port, auth).
  if (/[/?#]/.test(trimmed)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)) return null;
  if (trimmed.includes('@')) return null;
  if (trimmed.includes(' ')) return null;
  if (trimmed.includes('*')) return null;

  if (isIpLiteral(trimmed)) return null;

  if (RESERVED_HOSTNAME_EXACT.has(trimmed)) return null;
  if (RESERVED_HOSTNAME_SUFFIXES.some((suffix) => trimmed.endsWith(suffix))) return null;

  // Validate as a hostname by parsing under a synthetic http URL. This rejects
  // invalid characters, empty labels, and structural issues. We do NOT require
  // URL round-trip equality because the URL parser decodes punycode (xn--...)
  // to Unicode; valid punycode labels are accepted as-is.
  try {
    new URL(`http://${trimmed}`);
  } catch {
    return null;
  }
  // Reject labels that are empty or over 63 chars.
  const labels = trimmed.split('.');
  if (labels.some((label) => !label || label.length > 63)) return null;
  // Each label must be alphanumeric/hyphen, not start/end with hyphen.
  // Punycode labels (xn--) and plain ASCII labels both pass this.
  if (!labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
  // Reject any non-ASCII characters; only canonical ASCII/punycode is stored.
  if (!/^[a-z0-9.-]+$/.test(trimmed)) return null;

  return trimmed;
}

/**
 * Parse a raw `custom_hostname` input into a canonical stored value.
 *
 * - `null` / `undefined` / `''` -> `null` (clears the binding)
 * - valid hostname -> canonical lowercase ASCII string
 * - anything else -> throws a Zod error
 */
export function parseCustomHostnameInput(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return normalizeCustomHostname(String(value));
}

export const CUSTOM_HOSTNAME_ERROR = 'custom_hostname must be a bare ASCII hostname (no scheme, path, port, wildcard, IP, or localhost)';

const LOGO_URL_MAX_LENGTH = 2048;

/**
 * Parse a raw `logo_url` input into a canonical stored value.
 *
 * - `null` / `undefined` / `''` -> `null` (clears the logo)
 * - absolute `http:` / `https:` URL with no credentials and <= 2048 chars -> the trimmed URL
 * - anything else -> `null` (caller surfaces the error as a 400)
 *
 * The Worker never fetches this URL; it is rendered only by visitors' browsers.
 */
export function parseLogoUrlInput(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const trimmed = String(value).trim();
  if (trimmed.length === 0 || trimmed.length > LOGO_URL_MAX_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username !== '' || parsed.password !== '') return null;
  if (!parsed.hostname) return null;
  return trimmed;
}

export const LOGO_URL_ERROR = 'logo_url must be an absolute http(s) URL of at most 2048 characters';

export const CUSTOM_CSS_MAX_LENGTH = 16_384;
export const FOOTER_TEXT_MAX_LENGTH = 200;

export const CUSTOM_CSS_ERROR =
  'custom_css must be at most 16384 characters, contain no control characters other than tabs/newlines, and exclude <, @import, script URLs, or legacy CSS expressions';
export const FOOTER_TEXT_ERROR =
  'footer_text must be a single-line plain text string of at most 200 characters';

export type StatusPageThemeConfig = {
  custom_css: string | null;
  footer_hidden: boolean;
  footer_text: string | null;
};

export const DEFAULT_STATUS_PAGE_THEME_CONFIG: StatusPageThemeConfig = {
  custom_css: null,
  footer_hidden: false,
  footer_text: null,
};

export const statusPageThemeConfigSchema = z.object({
  custom_css: z.string().nullable().default(null),
  footer_hidden: z.boolean().default(false),
  footer_text: z.string().nullable().default(null),
});

const themeConfigInputSchema = z
  .object({
    custom_css: z.union([z.string(), z.null()]).optional(),
    footer_hidden: z.boolean().optional(),
    footer_text: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

export type StatusPageThemeConfigInput = z.infer<typeof themeConfigInputSchema>;

// Allow \t (0x09), \n (0x0a), \r (0x0d); reject all other C0 controls and DEL.
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

function hasDisallowedFooterControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
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

export type ThemeFieldParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export function parseCustomCssInput(value: unknown): ThemeFieldParseResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, message: CUSTOM_CSS_ERROR };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > CUSTOM_CSS_MAX_LENGTH) return { ok: false, message: CUSTOM_CSS_ERROR };
  if (hasDisallowedCssControlChar(trimmed)) {
    return { ok: false, message: CUSTOM_CSS_ERROR };
  }
  if (trimmed.includes('<')) return { ok: false, message: CUSTOM_CSS_ERROR };
  const inspected = unescapeCssForInspection(trimmed);
  for (const pattern of UNSAFE_CSS_PATTERNS) {
    if (pattern.test(inspected)) {
      return { ok: false, message: CUSTOM_CSS_ERROR };
    }
  }
  return { ok: true, value: trimmed };
}

export function parseFooterTextInput(value: unknown): ThemeFieldParseResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, message: FOOTER_TEXT_ERROR };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > FOOTER_TEXT_MAX_LENGTH) return { ok: false, message: FOOTER_TEXT_ERROR };
  if (hasDisallowedFooterControlChar(trimmed)) {
    return { ok: false, message: FOOTER_TEXT_ERROR };
  }
  return { ok: true, value: trimmed };
}

export function isDefaultThemeConfig(config: StatusPageThemeConfig): boolean {
  return (
    config.custom_css === null &&
    config.footer_hidden === false &&
    config.footer_text === null
  );
}

export function serializeThemeConfigJson(config: StatusPageThemeConfig): string | null {
  if (isDefaultThemeConfig(config)) return null;
  return JSON.stringify({
    custom_css: config.custom_css,
    footer_hidden: config.footer_hidden,
    footer_text: config.footer_text,
  });
}

export function parseStoredThemeConfigJson(raw: string | null | undefined): StatusPageThemeConfig {
  if (typeof raw !== 'string') {
    return { ...DEFAULT_STATUS_PAGE_THEME_CONFIG };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ...DEFAULT_STATUS_PAGE_THEME_CONFIG };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ...DEFAULT_STATUS_PAGE_THEME_CONFIG };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_STATUS_PAGE_THEME_CONFIG };
  }
  const record = parsed as Record<string, unknown>;
  const customCss = parseCustomCssInput(record.custom_css);
  const footerText = parseFooterTextInput(record.footer_text);
  const footerHidden = typeof record.footer_hidden === 'boolean' ? record.footer_hidden : false;
  return {
    custom_css: customCss.ok ? customCss.value : null,
    footer_hidden: footerHidden,
    footer_text: footerText.ok ? footerText.value : null,
  };
}

export function resolveThemeConfigInput(
  base: StatusPageThemeConfig,
  input: StatusPageThemeConfigInput | null | undefined,
): ThemeFieldParseResult<StatusPageThemeConfig> {
  if (input === undefined) {
    return { ok: true, value: { ...base } };
  }
  if (input === null) {
    return { ok: true, value: { ...DEFAULT_STATUS_PAGE_THEME_CONFIG } };
  }
  let customCss = base.custom_css;
  if (input.custom_css !== undefined) {
    const parsedCss = parseCustomCssInput(input.custom_css);
    if (!parsedCss.ok) return parsedCss;
    customCss = parsedCss.value;
  }
  let footerText = base.footer_text;
  if (input.footer_text !== undefined) {
    const parsedFooter = parseFooterTextInput(input.footer_text);
    if (!parsedFooter.ok) return parsedFooter;
    footerText = parsedFooter.value;
  }
  const footerHidden = input.footer_hidden === undefined ? base.footer_hidden : input.footer_hidden;
  return {
    ok: true,
    value: {
      custom_css: customCss,
      footer_hidden: footerHidden,
      footer_text: footerText,
    },
  };
}

export const createStatusPageInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  is_public: z.boolean().optional().default(true),
  custom_hostname: z.union([z.string(), z.null()]).optional().default(null),
  logo_url: z.union([z.string(), z.null()]).optional().default(null),
  theme_config: themeConfigInputSchema.nullable().optional(),
  monitor_ids: idListSchema.optional().default([]),
});

export const patchStatusPageInputSchema = z
  .object({
    slug: slugSchema.optional(),
    name: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    is_public: z.boolean().optional(),
    custom_hostname: z.union([z.string(), z.null()]).optional(),
    logo_url: z.union([z.string(), z.null()]).optional(),
    theme_config: themeConfigInputSchema.nullable().optional(),
    monitor_ids: idListSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });
