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
export const CUSTOM_CSS_MAX_LENGTH = 16384;
export const FOOTER_TEXT_MAX_LENGTH = 200;
export const CUSTOM_CSS_ERROR =
  'custom_css must be at most 16384 characters and cannot contain HTML tags, control characters, @import, expression(), behavior, -moz-binding, or active script/data URLs';
export const FOOTER_TEXT_ERROR =
  'footer_text must be a single line of at most 200 characters without control characters';
export const THEME_CONFIG_ERROR =
  'theme_config must be an object with optional custom_css, footer_hidden, and footer_text fields';

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
  custom_css: z.string().nullable(),
  footer_hidden: z.boolean(),
  footer_text: z.string().nullable(),
});

export const statusPageThemeConfigInputSchema = z
  .object({
    custom_css: z.union([z.string(), z.null()]).optional(),
    footer_hidden: z.boolean().optional(),
    footer_text: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

export type StatusPageThemeConfigInput = z.infer<typeof statusPageThemeConfigInputSchema>;

const CSS_COMMENT_RE = /\/\*[\s\S]*?(?:\*\/|$)/g;
const CSS_ESCAPE_RE = /\\(?:(\r\n|[\n\r\f])|([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?|([^\r\n\f0-9a-fA-F]))/g;
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

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
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

export function parseCustomCssInput(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > CUSTOM_CSS_MAX_LENGTH) {
    throw new Error(CUSTOM_CSS_ERROR);
  }
  if (hasDisallowedCssControlChar(trimmed) || trimmed.includes('<')) {
    throw new Error(CUSTOM_CSS_ERROR);
  }
  const withoutComments = trimmed.replace(CSS_COMMENT_RE, '');
  const decoded = decodeCssEscapesSinglePass(withoutComments);
  if (decoded.includes('<') || UNSAFE_CSS_PATTERNS.some((pattern) => pattern.test(decoded))) {
    throw new Error(CUSTOM_CSS_ERROR);
  }
  return trimmed;
}

export function parseFooterTextInput(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > FOOTER_TEXT_MAX_LENGTH || hasControlChar(trimmed)) {
    throw new Error(FOOTER_TEXT_ERROR);
  }
  return trimmed;
}

export function sameStatusPageThemeConfig(
  left: StatusPageThemeConfig | undefined,
  right: StatusPageThemeConfig | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }
  return (
    left.custom_css === right.custom_css &&
    left.footer_hidden === right.footer_hidden &&
    left.footer_text === right.footer_text
  );
}

export function resolveThemeConfigInput(
  input: StatusPageThemeConfigInput | null | undefined,
  base: StatusPageThemeConfig = DEFAULT_STATUS_PAGE_THEME_CONFIG,
): StatusPageThemeConfig {
  if (input === undefined) {
    return { ...base };
  }
  if (input === null) {
    return { ...DEFAULT_STATUS_PAGE_THEME_CONFIG };
  }
  return {
    custom_css:
      input.custom_css === undefined ? base.custom_css : parseCustomCssInput(input.custom_css),
    footer_hidden:
      input.footer_hidden === undefined ? base.footer_hidden : input.footer_hidden,
    footer_text:
      input.footer_text === undefined ? base.footer_text : parseFooterTextInput(input.footer_text),
  };
}

export function serializeThemeConfigJson(config: StatusPageThemeConfig): string | null {
  if (sameStatusPageThemeConfig(config, DEFAULT_STATUS_PAGE_THEME_CONFIG)) {
    return null;
  }
  return JSON.stringify(config);
}

export function parseStoredThemeConfigJson(raw: string | null | undefined): StatusPageThemeConfig {
  if (!raw) {
    return { ...DEFAULT_STATUS_PAGE_THEME_CONFIG };
  }
  try {
    const parsedJson = JSON.parse(raw) as unknown;
    const parsed = statusPageThemeConfigSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return { ...DEFAULT_STATUS_PAGE_THEME_CONFIG };
    }
    return {
      custom_css: parseCustomCssInput(parsed.data.custom_css),
      footer_hidden: parsed.data.footer_hidden,
      footer_text: parseFooterTextInput(parsed.data.footer_text),
    };
  } catch {
    return { ...DEFAULT_STATUS_PAGE_THEME_CONFIG };
  }
}

export function isValidStoredThemeConfig(value: unknown): value is StatusPageThemeConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    (obj.custom_css === null || typeof obj.custom_css === 'string') &&
    typeof obj.footer_hidden === 'boolean' &&
    (obj.footer_text === null || typeof obj.footer_text === 'string')
  );
}

export const createStatusPageInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  is_public: z.boolean().optional().default(true),
  custom_hostname: z.union([z.string(), z.null()]).optional().default(null),
  logo_url: z.union([z.string(), z.null()]).optional().default(null),
  theme_config: z.union([statusPageThemeConfigInputSchema, z.null()]).optional().default(null),
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
    theme_config: z.union([statusPageThemeConfigInputSchema, z.null()]).optional(),
    monitor_ids: idListSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });
