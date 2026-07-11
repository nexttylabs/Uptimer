---
title: "feat: multi-status-page admin UI"
type: feat
status: proposed
date: 2026-07-11
origin: "Confirmed imm-brainstorm manifest for the multi-status-page management UI"
---

# Iteration Plan

## Task

- Summary: Complete the Admin UI for explicit status-page management and publication assignment by reusing the existing status-page backend.
- Origin: User confirmed the proposed Admin management scope after `imm-brainstorm`.
- Spec: docs/specs/multi-status-page-admin-ui.spec.md
- Brainstorm manifest: BR-REQ-1, BR-REQ-2, BR-REQ-3, BR-REQ-4, BR-REQ-5, BR-DEC-1, BR-DEC-2, BR-OUT-1, BR-OUT-2, BR-DEFER-1

## Output Language

Human-readable Spec and Plan prose is English. Schema fields, API routes, commands, identifiers, enum values, and canonical terms remain literal.

## Brainstorm manifest

- BR-REQ-1: Admin provides status-page list and CRUD.
- BR-REQ-2: Admin configures unique `slug`, name, and public-page access.
- BR-REQ-3: Admin assigns monitors and controls grouping/order for each page.
- BR-REQ-4: Incident and maintenance flows select target status pages.
- BR-REQ-5: Default status page and `/` compatibility remain intact.
- BR-DEC-1: Reuse existing Admin APIs and frontend stack; do not rebuild the backend.
- BR-DEC-2: Shared-monitor configuration remains page-isolated.
- BR-OUT-1: Do not implement custom domains.
- BR-OUT-2: Do not implement per-page themes, team permissions, or notification configuration.
- BR-DEFER-1: Advanced branding and permissions wait for demonstrated demand.

## Research

- The status-page persisted model, public slug routes, refresh queue, and Admin CRUD already exist and passed the prior six-step Plan (`docs/specs/multi-public-status-pages.spec.md`, `apps/worker/src/routes/admin-status-pages.ts`).
- `apps/web/src/api/types.ts` and `apps/web/src/api/client.ts` contain no status-page Admin contract, and `AdminDashboard.tsx` has no status-page tab or query.
- `IncidentForm.tsx` and `MaintenanceWindowForm.tsx` collect only `monitor_ids`, while Worker Zod schemas require explicit non-empty `status_page_ids` for create and maintenance patch.
- Admin incident/maintenance response helpers currently expose affected monitors but not existing status-page links, so a minimal additive response field is needed for safe edit/display behavior.
- `apps/web` has lint/typecheck scripts but no frontend test runner. Worker Vitest plus a reproducible browser scenario is the smallest real feedback loop.
- `Develop/Local-Development-Experience.md` is absent, so no local-only operational guidance was available.

## Decisions

- D1: Add one `status-pages` tab to the existing `AdminDashboard` and reuse its modal/query/mutation patterns.
- D2: Add no dependency and no new route; public links target `/status/:slug`.
- D3: Keep page CRUD and monitor membership in one small `StatusPageForm`; page-local ordering remains seeded by existing monitor metadata because the current API has no ordering mutation.
- D4: Add `status_page_ids` to Admin incident/maintenance representations and form inputs; keep `monitor_ids` semantically separate.
- D5: Preserve restrictive deletion and display the Worker `CONFLICT` message instead of inventing force deletion.
- D6: Keep `/` compatibility and all public cache/snapshot behavior untouched.

## Assumptions

- Status-page `name` is the Admin label and `title` is public-facing.
- Existing global site settings remain global.
- The prior status-page backend is the authoritative implementation and is not reopened except for additive Admin response representation.
- Page-local grouping/order controls are partially covered by preserving seeded ordering; dedicated per-page reorder controls require a future API contract.

## Brainstorm Trace

| Item | Status | Target | Reason |
| --- | --- | --- | --- |
| BR-REQ-1 | covered_by_step | U1 | The Step delivers list/create/edit/restrictive-delete UI. |
| BR-REQ-2 | covered_by_step | U1 | The form manages name/slug and rows link to `/status/:slug`. |
| BR-REQ-3 | partially_covered | U1 | Monitor membership is delivered; current API only seeds page-local group/order from monitor metadata, so dedicated per-page reorder controls are deferred rather than faked. |
| BR-REQ-4 | covered_by_step | U1 | Incident and maintenance forms submit explicit `status_page_ids`. |
| BR-REQ-5 | covered_by_step | U1 | The Step does not alter `/` or default-page public routing. |
| BR-DEC-1 | captured_as_decision | D1, D2 | Existing APIs and Web patterns are reused; only an additive response field closes the edit contract. |
| BR-DEC-2 | covered_by_step | U1 | The browser scenario edits one shared-monitor page and proves the sibling page is unchanged. |
| BR-OUT-1 | out_of_scope | Non-goals | Custom domains require a separate Host/certificate/cache design. |
| BR-OUT-2 | out_of_scope | Non-goals | Themes, permissions, and notifications are unrelated to basic management. |
| BR-DEFER-1 | deferred | Non-goals | Promote only after concrete branding or authorization requirements exist. |

## Devil's Advocate Audit

### Rollback resilience

- Worker changes are additive response fields with no migration. Deploy Worker first; a partial Web failure can be rolled back without data repair.
- Mutations use existing validated Admin endpoints. Failed requests retain form state and query cache; restrictive deletion prevents accidental publication loss.
- No public route, snapshot key, refresh queue, or schema is modified, so rollback does not endanger released page isolation.

### Verification vanity

- Worker tests must assert exact linked `status_page_ids`, not merely HTTP success.
- Typecheck alone cannot prove page isolation or usable errors, so browser verification must create two pages with shared/exclusive monitors, edit one, open both public links, and trigger a restrictive deletion conflict.
- The full workspace test run protects the existing default alias, public boundary, and refresh queue contracts from accidental regression.

### Spec dilution detection

- Every confirmed Brainstorm item is mapped. CRUD, public links, explicit incident/maintenance publication, default compatibility, and shared-monitor isolation remain mandatory.
- `BR-REQ-3` is explicitly partial: monitor assignment is in scope, but dedicated page-local reorder/group controls are not claimed without a supporting API. The existing seeded ordering remains intact.
- Custom domains, branding, RBAC, and per-page notifications stay explicit non-goals rather than placeholder fields.

## Steps

### Step 1

- Step ID: U1
- Result: Admin users manage explicit status-page publication from one dashboard
- Verification: `pnpm --filter @uptimer/worker exec vitest run --config vitest.config.ts test/admin-status-pages.test.ts test/admin-incidents.test.ts test/admin-maintenance-windows.test.ts && pnpm --filter @uptimer/web lint && pnpm --filter @uptimer/web typecheck && pnpm test` exits zero; local browser verification creates two status pages with shared/exclusive monitors, edits page A without changing page B, opens both `/status/:slug` links, creates an incident and maintenance window with independent monitor/page selections, edits the maintenance assignment, and confirms linked-page deletion shows the Worker `CONFLICT` message without removing the page
- Verification type: hitl
- Test scenarios: status-page list/create/edit/delete uses existing Admin API; duplicate or malformed slug keeps the modal open with an actionable error; public link targets `/status/:slug`; page A monitor replacement retains page B shared monitor; incident creation requires both affected monitors and target pages; maintenance create/edit retains explicit target pages; failed status-page loading blocks publication forms; all supported locales render labels; default `/` remains unchanged
- Discovery cache: apps/worker/src/routes/admin-status-pages.ts (existing CRUD and restrictive deletion); apps/worker/src/routes/admin.ts (incident/maintenance Admin representations); apps/worker/src/schemas/status-pages.ts (slug and monitor-list validation); apps/web/src/pages/AdminDashboard.tsx (tabbed Admin composition); apps/web/src/api/client.ts (Admin fetch conventions); apps/web/src/api/types.ts (request/response contracts); apps/web/src/components/IncidentForm.tsx (incident publication input); apps/web/src/components/MaintenanceWindowForm.tsx (maintenance create/edit input); apps/web/src/i18n/messages.ts (all supported locales)
- Execution note: test-first
- failure_behavior: If Admin responses cannot expose exact current publication links, block edit submission rather than replacing links from guessed state; mutation errors preserve query data and form inputs.
- security_considerations: All calls retain Admin Bearer authentication; Worker Zod remains authoritative for slug and ID validation; no credential or raw token is added to UI state.
- Depends on: None
