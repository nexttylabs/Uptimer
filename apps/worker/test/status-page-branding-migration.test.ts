import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  import.meta.dirname,
  '../migrations/0016_status_page_branding_ownership.sql',
);

describe('0016 status-page branding ownership migration', () => {
  it('deletes only the retired global branding settings', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/DELETE FROM settings\s+WHERE key IN \('site_title', 'site_description'\)/);
    expect(sql).not.toMatch(/DELETE FROM status_pages/i);
    expect(sql).not.toContain('site_locale');
    expect(sql).not.toContain('site_timezone');
  });
});
