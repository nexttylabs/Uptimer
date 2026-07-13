import { describe, expect, it } from 'vitest';

import { resolveLoginReturnTarget } from './loginReturnTarget';

describe('resolveLoginReturnTarget', () => {
  it('preserves a same-origin route location', () => {
    expect(
      resolveLoginReturnTarget(
        { pathname: '/status/private', search: '?range=30d', hash: '#incident-4' },
        '/admin',
      ),
    ).toEqual({
      pathname: '/status/private',
      search: '?range=30d',
      hash: '#incident-4',
    });
  });

  it.each([
    'https://evil.example/status/private',
    '//evil.example/status/private',
    null,
    { pathname: 7 },
  ])('rejects an external or malformed target', (value) => {
    expect(resolveLoginReturnTarget(value, '/admin')).toBe('/admin');
  });
});
