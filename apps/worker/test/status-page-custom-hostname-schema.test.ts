import { describe, expect, it } from 'vitest';

import {
  createStatusPageInputSchema,
  parseCustomHostnameInput,
  patchStatusPageInputSchema,
} from '../src/schemas/status-pages';

describe('custom hostname normalization', () => {
  it.each([
    ['status.example.com', 'status.example.com'],
    ['STATUS.Example.COM', 'status.example.com'],
    ['status.example.com.', 'status.example.com'],
    ['  status.example.com  ', 'status.example.com'],
    ['xn--mnchen-3ya.com', 'xn--mnchen-3ya.com'],
    ['xn--80akhgyknj4f.com', 'xn--80akhgyknj4f.com'],
  ])('accepts %s -> %s', (input, expected) => {
    expect(parseCustomHostnameInput(input)).toBe(expected);
  });

  it.each([
    ['https://status.example.com'],
    ['status.example.com/path'],
    ['status.example.com:443'],
    ['status.example.com?q=1'],
    ['status.example.com#frag'],
    ['*.example.com'],
    ['user@status.example.com'],
    ['127.0.0.1'],
    ['10.0.0.1'],
    ['[::1]'],
    ['::1'],
    ['localhost'],
    ['sub.localhost'],
    ['host.local'],
    ['host.internal'],
    ['host.test'],
    ['status..example.com'],
    ['-leading.example.com'],
    ['trailing-.example.com'],
    ['a'.repeat(64) + '.example.com'],
  ])('rejects %s by returning null', (input) => {
    expect(parseCustomHostnameInput(input)).toBeNull();
  });

  it('treats empty, null, and undefined as a clear', () => {
    expect(parseCustomHostnameInput('')).toBeNull();
    expect(parseCustomHostnameInput(null)).toBeNull();
    expect(parseCustomHostnameInput(undefined)).toBeNull();
  });
});

describe('createStatusPageInputSchema', () => {
  it('defaults custom_hostname to null', () => {
    const parsed = createStatusPageInputSchema.parse({
      slug: 'partners',
      name: 'Partners',
      title: 'Partner status',
      monitor_ids: [1],
    });
    expect(parsed.custom_hostname).toBeNull();
  });

  it('accepts a hostname string (normalization happens at route level)', () => {
    const parsed = createStatusPageInputSchema.parse({
      slug: 'partners',
      name: 'Partners',
      title: 'Partner status',
      custom_hostname: 'STATUS.Example.com.',
      monitor_ids: [1],
    });
    expect(parsed.custom_hostname).toBe('STATUS.Example.com.');
  });

  it('accepts empty string (route clears to null)', () => {
    const parsed = createStatusPageInputSchema.parse({
      slug: 'partners',
      name: 'Partners',
      title: 'Partner status',
      custom_hostname: '',
      monitor_ids: [1],
    });
    expect(parsed.custom_hostname).toBe('');
  });

  it('accepts null to clear', () => {
    const parsed = createStatusPageInputSchema.parse({
      slug: 'partners',
      name: 'Partners',
      title: 'Partner status',
      custom_hostname: null,
      monitor_ids: [1],
    });
    expect(parsed.custom_hostname).toBeNull();
  });
});

describe('patchStatusPageInputSchema', () => {
  it('preserves undefined custom_hostname as a no-op', () => {
    const parsed = patchStatusPageInputSchema.parse({ name: 'New name' });
    expect(parsed.custom_hostname).toBeUndefined();
  });

  it('accepts a hostname string (normalization happens at route level)', () => {
    const parsed = patchStatusPageInputSchema.parse({ custom_hostname: 'STATUS.Example.com' });
    expect(parsed.custom_hostname).toBe('STATUS.Example.com');
  });

  it('accepts empty string (route clears to null)', () => {
    const parsed = patchStatusPageInputSchema.parse({ custom_hostname: '' });
    expect(parsed.custom_hostname).toBe('');
  });
});
