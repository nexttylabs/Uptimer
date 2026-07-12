#!/usr/bin/env bash
# U1 verification: prove migration 0017's partial unique index rejects duplicate
# non-null custom_hostname values against real local D1.
#
# Run from repo root after `pnpm --filter @uptimer/worker migrate:local`.
# Exit 0 = pass (duplicate rejected); non-zero = fail.
set -euo pipefail

cd "$(dirname "$0")/../apps/worker"

DB_NAME="uptimer"
WRANGLER="pnpm exec wrangler"
DUP_HOST="u1-verify-dup.example.com"

# Insert one binding (idempotent via IGNORE for re-runs).
$WRANGLER d1 execute "$DB_NAME" --local --command \
  "INSERT OR IGNORE INTO status_pages (slug, name, title, custom_hostname) VALUES ('u1-verify-dup','Verify','Verify','$DUP_HOST');" >/dev/null 2>&1 || true

# Second binding with the same non-null hostname MUST fail with SQLITE_CONSTRAINT.
DUP_OUTPUT=$($WRANGLER d1 execute "$DB_NAME" --local --command \
  "INSERT INTO status_pages (slug, name, title, custom_hostname) VALUES ('u1-verify-dup2','Verify2','Verify2','$DUP_HOST');" 2>&1 || true)

if echo "$DUP_OUTPUT" | grep -qi "SQLITE_CONSTRAINT\|UNIQUE constraint failed"; then
  echo "PASS: duplicate non-null custom_hostname rejected by partial unique index"
else
  echo "FAIL: duplicate non-null custom_hostname was NOT rejected" >&2
  echo "$DUP_OUTPUT" >&2
  exit 1
fi

# Cleanup verification rows.
$WRANGLER d1 execute "$DB_NAME" --local --command \
  "DELETE FROM status_pages WHERE slug IN ('u1-verify-dup','u1-verify-dup2');" >/dev/null 2>&1 || true

echo "U1 D1 verification complete."
