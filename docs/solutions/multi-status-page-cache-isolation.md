# Multi-Status-Page Cache Isolation

reusability: high
next_reuse_scenarios:
- Adding any new public-facing resource type that must be scoped per status page
- Adding custom-domain Host routing in a future phase
- Introducing per-page branding or notification policy

key_files:
- apps/worker/src/snapshots/public-page-keys.ts
- apps/worker/src/snapshots/status-page-refresh-queue.ts
- apps/worker/src/public/status-page.ts
- apps/worker/src/routes/public.ts
- apps/web/src/app/StatusPageSlugContext.tsx
- apps/web/src/api/client.ts
- apps/web/public/_worker.js

## Problem

Uptimer had a single implicit public status page. We needed multiple independently
addressable status pages (`/status/:slug`) without introducing an Application entity
or multi-tenant model, while preserving the released Cloudflare Free Plan `<10ms`
CPU baseline and default-page compatibility.

## Solution

### Page-qualified key factory

A single `public-page-keys.ts` module generates all snapshot, fragment, guard, and
runtime keys. Default page (id=1) keeps legacy keys (`status`, `homepage`, etc.);
non-default pages get `status:page:<id>`. This avoids a migration of existing
snapshot rows while guaranteeing key isolation.

### Dirty-page refresh queue

An append-only D1 table `status_page_refresh_queue` stores only page IDs. Admin
mutations (monitor/incident/maintenance create/patch/delete, status-page create/update)
enqueue only affected page IDs via reverse-lookup helpers. The scheduler consumes a
bounded batch (5) per tick: compute page-scoped payload → write `status:page:<id>` →
ack on success. Failure retains the queue item. This preserves the Free Plan CPU
profile by not fan-outing every page on every tick.

### Frontend slug propagation

A `StatusPageSlugContext` propagates the resolved slug to every public API call,
React Query key, and localStorage key. The Pages worker HTML injection cache key
includes the slug path. Slug pages skip default-page artifact injection (SPA
fallback only) to prevent cross-page HTML content leakage.

## Evidence

- `test/public-page-keys.test.ts` — key factory isolation
- `test/public-status-pages.test.ts` — page-scoped API isolation and 404 on cross-page access
- `test/status-page-refresh-queue.test.ts` — enqueue/dedup/list/ack semantics
- `test/internal-status-page-refresh.test.ts` — write-then-ack ordering
- `test/admin-status-pages.test.ts` — admin CRUD enqueues affected pages
- Full suite: 491 tests / 58 files pass

## Debate & Evidence Critique

**Falsifiability**: If a future custom-domain phase resolves page identity from Host
instead of slug, the key factory still works because it takes a numeric `statusPageId`,
not a slug. The frontend slug context would need a Host-based equivalent.

**Evidence trail**: All claims are backed by focused tests; no claim relies on
"should work" reasoning.

**Architecture entropy resistance**: The key factory is a single file with no
abstraction layers; the queue is a single D1 table with no new services (Queues/DO).
This appends cleanly to the existing snapshot architecture without duplicating patterns.
