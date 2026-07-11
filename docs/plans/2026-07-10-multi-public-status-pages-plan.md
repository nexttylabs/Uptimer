---
title: "feat: multi-public-status-pages"
type: feat
status: proposed
date: 2026-07-10
origin: "Confirmed imm-brainstorm manifest for multi-public status pages"
---

# Iteration Plan

## Task

- Summary: Replace Uptimer's single implicit public status page with explicit status pages while preserving a default-page compatibility path and the released Free Plan snapshot CPU profile.
- Origin: User confirmed the multi-page framing and `BR-Q-1`: incidents and maintenance windows are public only through explicit status-page links; monitor links express affected scope only.
- Spec: docs/specs/multi-public-status-pages.spec.md
- Output Language: Human-readable prose is English. Schema fields, API routes, command lines, identifiers, and canonical terms remain literal.
- Brainstorm manifest: BR-REQ-1, BR-REQ-2, BR-REQ-3, BR-REQ-4, BR-REQ-5, BR-DEC-1, BR-DEC-2, BR-DEC-3, BR-DEC-4, BR-DEFER-1, BR-DEFER-2, BR-OUT-1
- Research: `monitors.show_on_status_page` is the sole current public-visibility gate (`apps/worker/migrations/0009_monitor_status_page_visibility.sql`, `apps/worker/src/public/visibility.ts`). Public payloads derive incidents/maintenance by monitor visibility (`apps/worker/src/public/data.ts`). Snapshot keys, fragments, guard versions, Worker hot routes, Pages injected HTML, browser caches, and React queries are single-page keyed (`apps/worker/src/snapshots/`, `apps/worker/src/fetch-handler.ts`, `apps/web/public/_worker.js`, `apps/web/src/api/client.ts`). Existing snapshot CPU evidence requires static D1 snapshots, fragments, internal invocation, continuation, and new Tail/parity checks (`Develop/Worker-CPU-10ms-Release-Readiness.md`).
- Decisions:
  - D1: Use explicit status-page link tables. Do not introduce an Application table.
  - D2: Use `/status/:slug` plus page-scoped public API routes first. Custom domain Host resolution is deferred.
  - D3: Explicit `status_page_incidents` and `status_page_maintenance_windows` decide publication. Existing monitor links describe impact only.
  - D4: Create one default status page and link currently public monitors during migration; retain compatibility aliases to that page.
  - D5: Centralize page-qualified snapshot/fragment/guard/cache keys. Never interpolate raw request Host into a cache key.
  - D6: Refresh only dirty affected pages in bounded batches and continuation; do not fan out every page on every tick.
- Assumptions: Existing global site settings remain global in this slice. `status_pages.slug` is normalized lowercase URL-safe text. Status-page deletion is rejected while explicit incident or maintenance links exist, and requires unlinking monitors first; this avoids silent loss of a public boundary.
- Scope Mode: Six-step executable feature slice
- Engineering Closure Check:
  - architecture_surface: `apps/worker/migrations/`, `packages/db/src/schema.ts`, `apps/worker/src/{schemas,routes,public,snapshots,internal,scheduler,fetch-handler}.ts`, `apps/web/{public,src}/`, `apps/worker/test/`
  - dependencies_known: yes; existing D1, Drizzle, Hono, Zod, React Router, TanStack Query, Vitest, and Worker service-binding patterns are sufficient
  - verification_path: focused migration/contract/public/cache/snapshot tests; `pnpm lint`; `pnpm typecheck`; `pnpm test`; local migration; Dev and Production Tail plus public parity before release
  - blockers: none
  - replan_condition: if bounded dirty-page refresh cannot retain the release CPU profile, stop before UI rollout and return to planning with measured invocation evidence

## Brainstorm Trace

| Item | Status | Target | Reason |
| ---- | ------ | ------ | ------ |
| BR-REQ-1 | covered_by_step | MSP-1, MSP-2 | Explicit pages, page monitor links, and management contracts are introduced first. |
| BR-REQ-2 | covered_by_step | MSP-3 | Every public route is resolved and authorized by page scope. |
| BR-REQ-3 | covered_by_step | MSP-2, MSP-3 | Explicit page links govern incident and maintenance publication and public reads. |
| BR-REQ-4 | covered_by_step | MSP-4, MSP-5 | Snapshot, fragment, guard, Worker, Pages, browser, and query cache keys are page-qualified. |
| BR-REQ-5 | covered_by_step | MSP-5, MSP-6 | Dirty-page batching and CPU/parity release evidence are required. |
| BR-DEC-1 | captured_as_decision | D1 | No Application entity is added. |
| BR-DEC-2 | covered_by_step | MSP-2, MSP-3 | Explicit page links decide public event and maintenance visibility. |
| BR-DEC-3 | covered_by_step | MSP-2, MSP-3 | Monitor relations remain affected-scope metadata only. |
| BR-DEC-4 | covered_by_step | MSP-1 | Default-page migration preserves current public monitor visibility. |
| BR-DEFER-1 | deferred | Roadmap | Custom domain Host routing/certificates follow released slug routing and cache evidence. |
| BR-DEFER-2 | deferred | Roadmap | Tenant/RBAC and per-page credentials require a separate authorization plan. |
| BR-OUT-1 | captured_as_decision | D1 | Shared monitor display is provided by `status_page_monitors`, not duplicate monitors. |

## Devil's Advocate Audit

### Rollback resilience

- MSP-1 is append-only and seeds a default page. If it fails locally, restore D1 from the pre-migration backup or roll back the deployment; do not edit an applied migration. The old boolean remains available as evidence until a later cleanup migration.
- MSP-2 and MSP-3 replace link rows in D1 batches after validating all IDs. A failed request leaves previous committed links intact; status-page deletion is restrictive rather than cascading.
- MSP-4 and MSP-5 ship behind compatibility aliases. If a page-scoped snapshot path misbehaves, roll back the Worker/Pages deployment together; the default page reads legacy snapshot rows until all page-qualified snapshot rows are proven fresh.
- MSP-6 does not authorize production rollout until local migration, focused regressions, and Tail/parity checks pass. A CPU regression means flags/deployment roll back to the recorded baseline, not a partial hot-path workaround.

### Verification vanity

- Migration verification must query the local D1 database and prove the default page has exactly the monitors previously selected by `show_on_status_page`; typechecking a migration file is insufficient.
- Route tests must request two pages with shared and exclusive monitors, then attempt cross-page monitor/history IDs and expect `404`; merely asserting a `pageId` parameter was passed does not prove isolation.
- Cache tests must warm page A and request page B through Worker, Pages, browser-storage, and Query cache surfaces. Snapshot tests must inspect page-qualified fragment/guard keys and reject cross-page rows.
- CPU verification must include the actual scheduled/internal snapshot paths and public homepage/status/artifact parity, using the release Tail criteria; unit timing alone cannot prove the 10ms profile.

### Spec dilution detection

- The Plan covers every confirmed `BR-*` item. It does not silently replace multi-page links with one `status_page_id` column, infer event visibility from monitor links, or omit history/detail endpoint checks.
- Deferred custom domains, tenant/RBAC, per-page notification policy, and branding are explicitly retained in the Spec Roadmap; no deferred item is represented as delivered by a nullable `domain` column.

## Steps

### Step 1

- Step ID: U1
- Result: Status-page persisted model preserves default-page compatibility
- Verification: `pnpm --filter @uptimer/worker exec vitest run --config vitest.config.ts test/status-pages-migration.test.ts test/status-pages-schema.test.ts` exits zero; `pnpm --filter @uptimer/worker migrate:local` exits zero; a local D1 query proves exactly one default page exists and its monitor links match the pre-migration `show_on_status_page = 1` set
- Test scenarios: migration seeds the default slug deterministically; page/monitor links support shared monitors and page-local order/grouping; page incident/maintenance links are unique; existing public monitors retain visibility through default-page links; malformed or duplicate slugs fail schema validation; the old boolean is not used to decide post-migration page membership
- Discovery cache: apps/worker/migrations/0009_monitor_status_page_visibility.sql (legacy source); apps/worker/migrations/0012_public_snapshot_fragments.sql (append-only migration style); packages/db/src/schema.ts (Drizzle mirror); apps/worker/test/helpers/fake-d1.ts (D1 test double)
- Execution note: test-first
- failure_behavior: If the seed cannot determine a stable default page or preserve current visibility, stop without applying a replacement migration and replan the compatibility contract.
- security_considerations: Normalize slugs before unique persistence; validate all IDs and retain restrictive deletion semantics.
- Depends on: None

### Step 2

- Step ID: U2
- Result: Admin APIs manage explicit status-page publication links safely
- Verification: `pnpm --filter @uptimer/worker exec vitest run --config vitest.config.ts test/admin-status-pages.test.ts test/admin-incidents.test.ts test/admin-maintenance-windows.test.ts` exits zero
- Test scenarios: admin CRUD validates normalized unique slug; monitor assignment replaces page links atomically and retains a shared monitor on another page; incident/maintenance create and patch require explicit non-empty `status_page_ids`; monitor links remain impact metadata; invalid resource IDs fail without partial links; deletion rejects linked pages and parent deletion removes its page links
- Discovery cache: apps/worker/src/routes/admin.ts (monitor, incident, maintenance CRUD and snapshot queue); apps/worker/src/schemas/ (Zod boundaries); apps/worker/src/public/homepage-guard-state.ts (invalidation); apps/web/src/api/types.ts (shared API representations)
- Execution note: test-first
- failure_behavior: If link replacement cannot be made atomic in D1, retain existing links and reject the mutation rather than leaving a partly visible page.
- security_considerations: Admin Bearer checks remain mandatory; never accept unvalidated linked IDs or expose hidden page configuration through public responses.
- Depends on: 1

### Step 3

- Step ID: U3
- Result: Page-scoped public APIs enforce publication boundaries
- Verification: `pnpm --filter @uptimer/worker exec vitest run --config vitest.config.ts test/public-status-pages.test.ts test/public-status.test.ts test/public-homepage-downgrade-guard.test.ts` exits zero
- Test scenarios: slug routes return only linked monitors with page-local group/order; explicit page incidents/maintenance render even with no monitor relation; linked monitor IDs describe impact only; page A cannot read page B monitor latency/uptime/outages/day-context, incident history, maintenance history, or analytics; unknown slug and outside resource return standard `NOT_FOUND`; default aliases preserve prior public endpoint output
- Discovery cache: apps/worker/src/public/data.ts (current monitor-derived visibility); apps/worker/src/public/status.ts (public payload compute); apps/worker/src/public/visibility.ts (visibility predicates); apps/worker/src/routes/public.ts (public resources); apps/worker/src/routes/public-ui.ts (public detail resources); apps/worker/src/routes/public-ui-analytics.ts (public analytics); apps/worker/src/routes/public-hot.ts (hot snapshot routes)
- failure_behavior: If any unscoped public detail route remains reachable, keep it default-page-only or remove it before publishing page-scoped routes.
- security_considerations: Resolve a validated page object once per request; pass only its numeric ID to parameterized D1 queries.
- Depends on: 2

### Step 4

- Step ID: U4
- Result: Page-qualified Worker snapshot persistence prevents cross-page D1 or isolate-cache reads
- Verification: `pnpm --filter @uptimer/worker exec vitest run --config vitest.config.ts test/public-page-keys.test.ts test/snapshots-public-status.test.ts test/snapshots-public-homepage.test.ts test/snapshots-public-monitor-fragments.test.ts` exits zero
- Test scenarios: centralized key factory creates distinct snapshot, artifact, fragment, runtime, and guard keys per page; D1 and Worker isolate-cache reads reject/ignore another page's rows; status/homepage artifacts and stale fallbacks remain within one page; default aliases use the default page identity
- Discovery cache: apps/worker/src/snapshots/public-status-read.ts (hard-coded status key and isolate cache); apps/worker/src/snapshots/public-homepage-read.ts (hard-coded homepage/artifact keys and isolate caches); apps/worker/src/snapshots/public-monitor-fragments.ts (fragment keys); apps/worker/src/public/homepage-guard-state.ts (guard keys); apps/worker/src/snapshots/public-page-keys.ts (central page-qualified key factory)
- Execution note: characterization-first
- failure_behavior: If a legacy Worker snapshot reader cannot carry page identity, page-scoped callers must bypass it and compute live rather than read the default-page row.
- security_considerations: Snapshot and guard key input is resolved numeric page identity, never raw Host, raw slug, or untrusted query data.
- Depends on: 3

### Step 5

- Step ID: U5
- Result: Bounded dirty-page snapshot refresh publishes page-qualified snapshots with continuation semantics
- Verification: `pnpm --filter @uptimer/worker exec vitest run --config vitest.config.ts test/internal-sharded-public-snapshot.test.ts test/internal-scheduled-check-batch.test.ts test/index-scheduled.test.ts test/internal-runtime-fragments-refresh.test.ts` exits zero
- Test scenarios: a monitor runtime update marks only pages containing it dirty; page relation/incident/maintenance mutations mark only directly linked pages dirty; a bounded scheduled/internal batch publishes a continuation for remaining pages; shared monitors refresh every linked page exactly once; each non-default page writes only its own qualified snapshot and fragment keys; stale/missing page fragments do not publish another page's snapshot; default page retains existing scheduled behavior
- Discovery cache: apps/worker/src/scheduler/scheduled.ts (scheduled orchestration); apps/worker/src/internal/sharded-public-snapshot-core.ts (fragment assembly and publish); apps/worker/src/internal/sharded-public-snapshot-continuation.ts (bounded continuation); apps/worker/src/internal/monitor-fragments-refresh-core.ts (monitor fragment refresh); apps/worker/src/internal/runtime-fragments-refresh-core.ts (runtime fragment refresh); apps/worker/src/snapshots/public-fragments.ts (fragment persistence)
- Execution note: characterization-first
- Parallel probes: [{"scope":"apps/worker/src/scheduler/ and apps/worker/src/internal/","output":"current continuation and bounded-batch call graph with affected-page insertion points","readonly":true},{"scope":"apps/worker/src/snapshots/ and apps/worker/src/public/","output":"fragment/guard key lifecycle and invalidation map","readonly":true},{"scope":"apps/worker/test/internal-*.test.ts and test/index-scheduled.test.ts","output":"existing fake-D1/service-binding test conventions","readonly":true}]
- failure_behavior: If bounded page refresh cannot be scheduled without widening each invocation, keep the current default-only publication path and return to planning with measured CPU evidence.
- security_considerations: Internal endpoints remain Bearer-protected and feature-flag gated; dirty-page queue data contains IDs only and never secrets.
- Depends on: 4

### Step 6

- Step ID: U6
- Result: Slug-routed status page UI has page-isolated caches
- Verification: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @uptimer/worker migrate:local` exit zero; local browser verification creates two pages with a shared and exclusive monitor and confirms `/status/:slug` isolation; browser, Pages HTML cache, Worker hot cache, and React Query warm page A without serving it to page B; controlled Dev and Production Tail show `BAD_OR_GE10 count=0` for affected scheduled/internal/public paths; each page's `homepage`, `status`, and `homepage-artifact` parity endpoint returns `200`
- Verification type: hitl
- Test scenarios: router extracts validated slug; status/history/detail UI retains slug in every request and query key; Pages injected HTML, Worker hot cache, browser localStorage/public cache, and React Query cache are page-qualified; browser reload/local cache does not reuse another page payload; admin UI manages pages and explicit page assignments; default `/` remains a compatibility redirect/render; missing slug shows a safe not-found state; no custom domain, tenant UI, or per-page notification controls are added
- Discovery cache: apps/web/src/app/router.tsx (slug route); apps/web/src/pages/StatusPage.tsx (status rendering); apps/web/src/pages/IncidentHistoryPage.tsx (page-scoped incident history); apps/web/src/pages/MaintenanceHistoryPage.tsx (page-scoped maintenance history); apps/web/src/api/client.ts (page-scoped API/query/browser cache); apps/web/src/api/types.ts (API representations); apps/web/src/pages/AdminDashboard.tsx (admin management); apps/web/public/_worker.js (Pages cache and proxy); apps/worker/src/fetch-handler.ts (Worker hot cache); Develop/Worker-CPU-10ms-Release-Readiness.md (CPU release evidence)
- failure_behavior: If a Web cache layer cannot preserve resolved page identity, disable it for page-scoped requests rather than serving another page's data; if UI routing or production Tail fails, roll back Worker and Pages as one release unit to the previous single-page deployment and preserve the additive schema for recovery.
- security_considerations: The web UI never stores new credentials; all admin calls retain the existing Bearer flow; public page failures must not fall back to another page's cached payload.
- Depends on: 5

## Roadmap continuation

- Custom domains: Add Pages-edge Host-to-page resolution and Cloudflare deployment/certificate documentation only after Step 6 release evidence; verification must warm two hostnames and prove no proxy/HTML cache bleed.
- Tenant/RBAC: Define data ownership, token scope, audit expectations, and notification isolation in a separate Spec before adding any tenant columns or per-page tokens.
- Branding and per-page settings: Promote only after a product decision defines override precedence versus global `settings`.
