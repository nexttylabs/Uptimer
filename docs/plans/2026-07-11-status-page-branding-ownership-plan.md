---
title: "fix: status-page-branding-ownership"
type: fix
status: proposed
date: 2026-07-11
origin: "Confirmed imm-brainstorm framing for status-page-owned title and description"
---

# Iteration Plan

## Task

- Summary: Remove conflicting global title/description ownership and make the resolved status page authoritative across public data, snapshots, metadata, and UI.
- Origin: User confirmed that `/` binds the `default` status page and that legacy `settings.site_title` / `settings.site_description` are deleted and removed from contracts.
- Spec: docs/specs/status-page-branding-ownership.spec.md
- Output Language: Human-readable prose is English. Schema fields, API routes, command lines, identifiers, and canonical terms remain literal.
- Brainstorm manifest: BR-REQ-1, BR-REQ-2, BR-DEC-1, BR-DEC-2, BR-OUT-1
- Research: `status_pages` already stores validated `title` and `description`, the migration creates slug `default`, and page mutations already enqueue page-scoped refresh. Global branding remains embedded in `settings.ts`, settings Zod/API/UI types, public status/homepage schemas, snapshot guard queries, artifact metadata, and React rendering. The smallest safe change preserves public field names where useful but changes their owner to the resolved page.
- Decisions:
  - D1: `status_pages.title` and `status_pages.description` are the sole public branding source.
  - D2: Unscoped public entry points resolve slug `default`; they never choose an arbitrary page or fall back to global settings.
  - D3: Delete the two legacy settings rows with a new append-only migration and reject future patches through the strict Settings schema.
  - D4: Keep other global settings unchanged and use fixed `Uptimer` branding for the Admin shell.
  - D5: Preserve existing public response field names when that reduces compatibility risk; ownership must still be page-local.
- Assumptions: Migration `0014_status_pages.sql` has been applied before the new cleanup migration. `default` remains the canonical compatibility slug. Existing page-qualified snapshot/cache keys are correct and remain in use.
- Scope Mode: One-step corrective slice
- Engineering Closure Check:
  - architecture_surface: `apps/worker/migrations/`, Worker settings/public/snapshot/internal schemas and tests, `apps/web/src/`, and `apps/web/public/_worker.js`
  - dependencies_known: yes; existing D1, Hono, Zod, snapshot refresh, React, and Vitest patterns are sufficient
  - verification_path: focused migration/settings/public snapshot tests, web lint/typecheck, full workspace tests, local migration, and two-page browser metadata verification
  - blockers: none
  - replan_condition: if unscoped `/` cannot resolve the default page without breaking the released snapshot CPU path, stop and return to planning with measured call-path evidence

## Brainstorm Trace

| Item | Status | Target | Reason |
| ---- | ------ | ------ | ------ |
| BR-REQ-1 | covered_by_step | U1 | Every public rendering and metadata path uses resolved status-page branding. |
| BR-REQ-2 | covered_by_step | U1 | Settings storage, API, UI, schemas, and guards retire both legacy fields. |
| BR-DEC-1 | covered_by_step | U1 | `/` resolves the existing `default` status page. |
| BR-DEC-2 | covered_by_step | U1 | A new migration deletes only the two legacy settings rows. |
| BR-OUT-1 | out_of_scope | Spec Non-goals | Per-page locale, timezone, theme, assets, and custom domains are unrelated to resolving the conflict. |

## Devil's Advocate Audit

### Rollback resilience

- The cleanup migration is append-only and deletes only two known settings keys. If deployment fails midway, roll back Worker and Web together; restore those two rows from a pre-migration backup only when running old code that still requires them. Never edit an applied migration.
- Runtime ignores stale legacy rows, so environments that deploy code before migration do not regain dual ownership.
- Existing `status_pages` data is not transformed or deleted. A failed branding refresh can be retried through the existing page-scoped queue.

### Verification vanity

- Migration tests must seed unrelated settings and status-page branding, apply the migration, and prove only the two legacy rows disappear.
- Public tests must create default plus non-default pages with deliberately conflicting values and assert JSON and artifact metadata per page; checking only the React heading would miss stale snapshots and SEO output.
- Settings tests must prove GET omits the fields and PATCH rejects them, rather than merely checking that Admin inputs were removed.
- Browser verification must inspect visible header, `document.title`, description/Open Graph/Twitter metadata, and warm page A before loading page B.

### Spec dilution detection

- The Plan covers both confirmed decisions: `/` binds `default`, and storage/contracts remove the legacy fields. It does not merely hide Admin controls or add precedence logic.
- Public static metadata, snapshot guards, and cache isolation are explicitly included; implementation cost cannot narrow the fix to React rendering.
- Unrelated per-page settings remain explicit non-goals rather than speculative extensions.

## Steps

### Step 1

- Step ID: U1
- Result: Public status-page branding has one page-local source
- Verification: `pnpm --filter @uptimer/worker exec vitest run --config vitest.config.ts test/status-page-branding-migration.test.ts test/admin-settings.test.ts test/admin-settings-homepage-refresh.test.ts test/public-status-pages.test.ts test/snapshots-public-status.test.ts test/snapshots-public-homepage.test.ts test/internal-homepage-refresh.test.ts && pnpm --filter @uptimer/web lint && pnpm --filter @uptimer/web typecheck && pnpm test && pnpm --filter @uptimer/worker migrate:local && git diff --check` exits zero; local browser verification sets conflicting branding on `default` and a second page, warms each route in both orders, and confirms header, `document.title`, description/Open Graph/Twitter metadata, and homepage artifact remain page-correct
- Verification type: hitl
- Test scenarios: cleanup migration removes only `site_title` and `site_description`; Settings GET omits and PATCH rejects retired fields; remaining settings retain values; unscoped public payload resolves `default`; scoped payloads and artifacts use page-local branding; missing/non-public default fails safely; page edit queues refresh; two page snapshots and HTML metadata never cross-contaminate; Admin settings no longer show branding fields; Admin document title remains `Uptimer`; all locales remain complete after removing obsolete labels
- Discovery cache: apps/worker/migrations/0014_status_pages.sql (canonical default page); apps/worker/src/public/status-page.ts (page resolution); apps/worker/src/settings.ts (legacy settings response and parsing); apps/worker/src/schemas/settings.ts (strict patch boundary); apps/worker/src/public/status.ts (public payload branding); apps/worker/src/public/homepage.ts (snapshot guards and payload construction); apps/worker/src/public/status-refresh.ts (status guard query); apps/worker/src/snapshots/public-homepage.ts (artifact and SEO metadata); apps/worker/src/routes/public.ts (scoped/unscoped routes); apps/web/src/pages/StatusPage.tsx (header and document title); apps/web/src/pages/AdminDashboard.tsx (legacy controls/cache updates); apps/web/src/api/types.ts (public/Admin contracts); apps/web/public/_worker.js (Pages metadata injection)
- Execution note: characterization-first
- failure_behavior: If any public or metadata path cannot carry a resolved page, fail the request or bypass stale output for that page; never fall back to legacy settings or another page. If `/` resolution threatens the released CPU path, stop and replan instead of adding a second branding source.
- security_considerations: Continue resolving validated public slugs and using numeric page-qualified snapshot keys; no raw Host or untrusted value becomes a cache key or HTML string without existing escaping.
- Depends on: None
