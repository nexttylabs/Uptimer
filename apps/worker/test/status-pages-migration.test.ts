import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = resolve(import.meta.dirname, '../migrations/0014_status_pages.sql');

describe('0014 status pages migration', () => {
  it('creates page publication tables and preserves current public monitors on the default page', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS status_pages');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_status_pages_slug');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS status_page_monitors');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS status_page_incidents');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS status_page_maintenance_windows');
    expect(sql).toMatch(/INSERT OR IGNORE INTO status_pages[\s\S]*'default'/);
    expect(sql).toMatch(/INSERT OR IGNORE INTO status_page_monitors[\s\S]*show_on_status_page = 1/);
  });
});
