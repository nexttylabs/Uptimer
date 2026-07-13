export type LoginReturnTarget = string | { pathname: string; search: string; hash: string };

export function resolveLoginReturnTarget(value: unknown, fallback: string): LoginReturnTarget {
  if (
    !value ||
    typeof value !== 'object' ||
    !('pathname' in value) ||
    typeof value.pathname !== 'string' ||
    !value.pathname.startsWith('/') ||
    value.pathname.startsWith('//')
  ) {
    return fallback;
  }

  return {
    pathname: value.pathname,
    search: 'search' in value && typeof value.search === 'string' ? value.search : '',
    hash: 'hash' in value && typeof value.hash === 'string' ? value.hash : '',
  };
}
