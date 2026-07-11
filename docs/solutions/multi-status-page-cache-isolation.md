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
- apps/worker/src/public/homepage.ts
- apps/worker/src/public/status-refresh.ts
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

### Branding ownership follows resolved page identity

Public `title` and `description` must have one owner: the resolved `status_pages`
row. Unscoped `/` resolves slug `default`; scoped routes resolve their requested
slug. Existing public response names such as `site_title` may remain for
compatibility, but their values flow from the resolved page through payload builders,
D1 snapshot guards, homepage artifacts, Pages HTML metadata injection, and React
rendering. Legacy global branding settings are deleted with an append-only migration
and removed from strict Settings contracts, preventing precedence rules from
reintroducing dual ownership.

When verifying this flow, use two pages with deliberately conflicting branding and
load them in both orders. Check the visible header, `document.title`, description,
Open Graph and Twitter metadata, plus the default homepage artifact. A Vite dev server
cannot validate Pages `_worker.js` metadata injection; use `wrangler pages dev` with
`UPTIMER_API_ORIGIN` bound to the local Worker.

## Evidence

- `test/public-page-keys.test.ts` — key factory isolation
- `test/public-status-pages.test.ts` — page-scoped API isolation and 404 on cross-page access
- `test/status-page-refresh-queue.test.ts` — enqueue/dedup/list/ack semantics
- `test/internal-status-page-refresh.test.ts` — write-then-ack ordering
- `test/admin-status-pages.test.ts` — admin CRUD enqueues affected pages
- `test/status-page-branding-migration.test.ts` — only retired global branding rows are deleted
- `test/public-fast-path-guards.test.ts` — snapshot guards read page-owned branding
- Chrome HITL through local Pages runtime — conflicting Alpha/Beta branding remained correct in A→B and B→A order across header, title, description, Open Graph, Twitter, and homepage artifact
- Full suite after branding ownership change: 495 tests / 59 files pass

## Debate & Evidence Critique

**Falsifiability**: If a future custom-domain phase resolves page identity from Host
instead of slug, the key factory still works because it takes a numeric `statusPageId`,
not a slug. The frontend slug context would need a Host-based equivalent. The branding
rule becomes too local only if public pages stop being status-page scoped; adding more
per-page properties does not falsify the single-owner rule.

**Evidence trail**: Cache-isolation claims are backed by focused tests. Branding
ownership additionally has migration/guard regressions, 495 passing tests, and a
Pages-runtime browser check in both navigation orders; it is not inferred from the
React heading alone.

**Architecture entropy resistance**: The key factory is a single file with no
abstraction layers; the queue is a single D1 table with no new services (Queues/DO).
Branding reuses the same resolved page identity and public field names rather than
adding a precedence layer or a second branding abstraction. Appending here avoids a
duplicate solution document for the same page-isolation invariant.
