# Multi-Status-Page Cache Isolation

reusability: high
next_reuse_scenarios:
- Adding any new public-facing resource type that must be scoped per status page
- Introducing per-page branding or notification policy
- Adding domain aliases or automatic certificate status polling in a future phase

key_files:
- apps/worker/src/snapshots/public-page-keys.ts
- apps/worker/src/snapshots/status-page-refresh-queue.ts
- apps/worker/src/public/status-page.ts
- apps/worker/src/public/homepage.ts
- apps/worker/src/public/status-refresh.ts
- apps/worker/src/routes/public.ts
- apps/worker/src/schemas/status-pages.ts
- apps/worker/src/routes/admin-status-pages.ts
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

### Custom-domain Host resolution and routing

To support vanity domains without automating Cloudflare DNS/TLS provisioning, we use
a custom-domain mapping layer at the Pages edge. Each status page may bind to a single
validated `custom_hostname`. The Pages worker resolves the request `Host` to its
page identity before any HTML cache lookup or API proxying.

- **Platform-host compatibility**: `UPTIMER_DEFAULT_HOSTS` lists normalized platform/default
  domains. If a request Host matches or if this config is absent, Pages runs in legacy/unscoped
  mode.
- **Fail-closed unknown hosts**: Any host not in the platform list and not bound in D1
  returns a `no-store` `404` error response.
- **Path rewriting & blocking**: Custom hosts rewrite unscoped public API paths (e.g. `/api/v1/public/status`)
  to their page-scoped equivalent (e.g. `/api/v1/public/status-pages/:slug/status`) before proxying, and
  block all `/admin` and `/internal` route access.
- **Cache-key qualification**: Custom-host HTML cache keys are qualified with a `|host:<hostname>`
  prefix, preventing page A's cached HTML from leaking to page B under the same edge worker.
- **Bootstrap slug injection**: The resolved slug is injected as `globalThis.__UPTIMER_STATUS_PAGE_SLUG__`
  into the HTML. The React router and API client use this bootstrap slug for the root path and
  unscoped history routes, ensuring the SPA reuses the same page-qualified Query and API client paths.
- **Canonical metadata**: HTML metadata injection adds `<link rel="canonical">` and `og:url` pointing
  directly to the custom hostname.

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
- `test/admin-status-pages.test.ts` — admin CRUD enqueues affected pages and custom_hostname persistence
- `test/status-page-branding-migration.test.ts` — only retired global branding rows are deleted
- `test/status-page-custom-domain-migration.test.ts` — D1 unique partial index behavior
- `test/status-page-custom-hostname-schema.test.ts` — Zod normalization and validation
- `test/public-custom-hostname-resolver.test.ts` — resolver metadata API 200/404
- `test/pages-custom-host-routing.test.ts` — edge routing, cache-key qualification, spoof rejection, both-orders warming
- `scripts/verify-u1-custom-hostname-d1.sh` — local D1 duplicate rejection script
- `test/public-fast-path-guards.test.ts` — snapshot guards read page-owned branding
- Chrome HITL through local Pages runtime — conflicting Alpha/Beta branding remained correct in A→B and B→A order across header, title, description, Open Graph, Twitter, and homepage artifact
- Chrome HITL through Vite dev server — custom hostname form input, i18n labels, edit form backfill, and resolver endpoint correct behavior
- Full suite after custom domain change: 549 tests / 63 files pass

## Debate & Evidence Critique

**Falsifiability**: If a future custom-domain phase resolves page identity from Host
instead of slug, the key factory still works because it takes a numeric `statusPageId`,
not a slug. The frontend slug context would need a Host-based equivalent. The branding
rule becomes too local only if public pages stop being status-page scoped; adding more
per-page properties does not falsify the single-owner rule. Similarly, Host-based routing
is falsified if the edge worker allows `X-Forwarded-Host` or query overrides, but tests prove
these are ignored and only the request hostname decides ownership.

**Evidence trail**: Cache-isolation claims are backed by focused tests. Branding
ownership additionally has migration/guard regressions, 495 passing tests, and a
Pages-runtime browser check in both navigation orders; it is not inferred from the
React heading alone. Custom domain routing adds 54 tests covering edge routing, cache
key qualification, and spoof rejection, backed by local D1 SQLITE_CONSTRAINT checks and
Chrome form-interaction verification.

**Architecture entropy resistance**: The key factory is a single file with no
abstraction layers; the queue is a single D1 table with no new services (Queues/DO).
Branding reuses the same resolved page identity and public field names rather than
adding a precedence layer or a second branding abstraction. Host-routing reuses the
same resolved page-slug context and qualified cache keys rather than creating a duplicate
business path or D1 snapshot keys. Appending here avoids a duplicate solution document
for the same page-isolation invariant.

## Admin-only private page access

Private slug pages reuse the existing Admin Bearer Token contract rather than adding
page passwords, share tokens, sessions, or RBAC. The worker resolves a slug through an
authorization-aware resolver: missing or invalid authorization returns the same
`404 NOT_FOUND` as an unknown slug, while authorized private success and error
responses use `Cache-Control: private, no-store` and `Vary: Authorization`. Authorized
payloads never enter public snapshots or shared caches.

The browser gates slug-scoped routes after the API's 404, then sends the user through
the existing admin login with a same-origin pathname/search/hash return target. The
Pages worker bypasses stale slug HTML cache entries and serves an unbranded, no-store
SPA shell when public visibility cannot be established. Analytics cache keys retain
`__status_page`; otherwise a warm public response could mask a private 404.

### Evidence

- `apps/worker/test/public-status-pages.test.ts` — private/unknown/authorized slug
  contracts, cache headers, snapshot-write protection, and analytics key isolation
- `apps/web/src/app/StatusPageAccessGate.tsx` — API-first access gate and accessible
  loading announcement
- `apps/web/src/app/loginReturnTarget.ts` — same-origin return-target validation
- `apps/web/public/_worker.js` — stale slug HTML bypass and neutral private shell
- Chrome HITL through local Pages + Worker + D1 — deep-link redirect/login return,
  refresh, logout, invalid-token recovery, public/private cache warm order, and
  private custom-host 404

### Reusability critique

- `reusability: high`
- `next_reuse_scenarios`: any future protected public resource that must preserve
  existence concealment and shared-cache safety; any additional page-scoped analytics
  endpoint; any route that needs a safe login return target.
- **Falsifiability**: This pattern is too strong if private resources later require
  delegated users or per-page roles; that would justify a new authorization model,
  not silently extending the single Admin token.
- **Evidence trail**: The 75 focused Worker tests, 5 Web tests, typecheck/lint checks,
  code/UI review passes, and recorded browser matrix support the current contract.
- **Architecture entropy resistance**: The design adds no new credential storage or
  service. It centralizes the access decision in the existing resolver and keeps edge
  HTML behavior deliberately neutral instead of duplicating authorization in Pages.
