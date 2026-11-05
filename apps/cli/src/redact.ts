const SENSITIVE_KEYS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'bot_token',
  'bot_token_encrypted',
  'password',
  'token',
  'secret',
  'api_key',
]);

const COMPLETE_REDACT_KEYS = new Set([
  'http_headers',
  'http_body',
]);

const CONFIG_SENSITIVE_KEYS = new Set([
  'headers',
  'url',
  'payload_template',
]);

export function redactCredentials(value: unknown, adminToken?: string, inConfig = false): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (adminToken && adminToken.length > 0) {
      return value.split(adminToken).join('[REDACTED]');
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactCredentials(item, adminToken, inConfig));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const lower = k.toLowerCase();
      if (inConfig && CONFIG_SENSITIVE_KEYS.has(lower)) {
        result[k] = '[REDACTED]';
      } else if (COMPLETE_REDACT_KEYS.has(lower)) {
        result[k] = '[REDACTED]';
      } else if (SENSITIVE_KEYS.has(lower)) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = redactCredentials(v, adminToken, lower === 'config');
      }
    }
    return result;
  }

  return value;
}
