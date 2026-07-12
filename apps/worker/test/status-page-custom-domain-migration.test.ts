import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = resolve(import.meta.dirname, '../migrations/0017_status_page_custom_hostname.sql');

describe('0017 status page custom hostname migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('adds a nullable custom_hostname column to status_pages', () => {
    expect(sql).toMatch(/ALTER TABLE status_pages ADD COLUMN custom_hostname TEXT/);
  });

  it('creates a partial unique index that allows multiple NULL bindings', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_status_pages_custom_hostname');
    expect(sql).toMatch(/ON status_pages \(custom_hostname\)/);
    expect(sql).toMatch(/WHERE custom_hostname IS NOT NULL/);
  });

  it('does not backfill or delete existing rows', () => {
    expect(sql).not.toMatch(/UPDATE status_pages/);
    expect(sql).not.toMatch(/DELETE FROM/);
    expect(sql).not.toMatch(/INSERT INTO/);
  });
});
