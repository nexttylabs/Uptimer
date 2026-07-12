---
title: "feat: status-page-custom-domains"
type: feat
status: proposed
date: 2026-07-12
origin: "Confirmed imm-brainstorm manifest for manual custom-domain status-page routing"
---

# Iteration Plan

## Task

- Summary: Add one manually provisioned custom hostname per public status page while preserving slug access, default-host compatibility, and page-qualified cache isolation.
- Origin: User confirmed the `imm-brainstorm` recommendation: Cloudflare owns domain/DNS/TLS provisioning; Uptimer owns validated persistence and `Host -> resolved page identity` routing.
- Spec: docs/specs/status-page-custom-domains.spec.md
- Brainstorm manifest: BR-REQ-1, BR-REQ-2, BR-REQ-3, BR-REQ-4, BR-REQ-5, BR-REQ-6, BR-REQ-7, BR-DEC-1, BR-DEC-2, BR-DEC-3, BR-OUT-1, BR-OUT-2, BR-OUT-3, BR-OUT-4

## Output Language

Human-readable prose is English. Paths, schema fields, API names, commands, identifiers, and canonical terms remain literal.

## Research

- Existing page identity is slug-resolved in `apps/worker/src/public/status-page.ts`, then converted to numeric page-qualified snapshot/cache keys. `docs/solutions/multi-status-page-cache-isolation.md` explicitly identifies Host routing as the next reuse case.
- `status_pages` already owns page-local branding and publication identity. Adding one nullable hostname there is smaller than introducing a domain table for unsupported aliases or lifecycle states.
- Pages `apps/web/public/_worker.js` currently proxies same-origin API requests, injects HTML metadata, and keys HTML cache by origin/path. Custom Host resolution must occur before those cache/proxy decisions.
- React public identity currently comes only from `/status/:slug` through `StatusPageSlugContext`; custom-host root routes need a trusted bootstrap identity so existing API, Query, memory, and localStorage qualification is reused.
- Cloudflare Pages requires a domain to be associated with the Pages project before DNS alone will work. External DNS subdomains use CNAME to `*.pages.dev`; apex domains require the zone on the same Cloudflare account. This Plan documents those prerequisites but does not automate them.
- Planner research dispatch used solo fallback `explicit_required`: the agent-local `imm-planner` policy requires explicit planner subagent authorization, and repo/cache evidence was sufficient for concrete decomposition.

## Decisions

- D1: Add nullable `status_pages.custom_hostname` with a unique partial index; do not add a domain table until multiple aliases or verification lifecycle is requested.
- D2: Persist canonical lowercase ASCII hostname only. Empty input clears it; schemes, paths, ports, wildcards, IP literals, localhost, and reserved deployment hosts are rejected.
- D3: Introduce `UPTIMER_DEFAULT_HOSTS` as the explicit platform/default-host compatibility boundary. Missing configuration keeps legacy default-host behavior and leaves custom routing disabled.
- D4: Resolve non-platform Host ownership before custom-host HTML cache reads or Public API proxying. Do not cache ownership in the initial slice.
- D5: Reuse existing slug-scoped Public API routes and numeric page-qualified snapshot keys after Host resolution; do not create Host-qualified business data paths.
- D6: Custom hosts fail closed for unknown/inactive/conflicting ownership and cannot override their resolved page via URL slug or forwarding headers.
- D7: A bound hostname is canonical for metadata, while `/status/:slug` remains directly usable without a forced redirect.
- D8: Worker and Pages routing deploy as one release unit; the additive migration remains safe during application rollback.

## Assumptions

- One Pages project serves the public UI and can be manually associated with every configured custom hostname.
- Operators can supply the generated `*.pages.dev` hostname and any existing default hostname to `UPTIMER_DEFAULT_HOSTS` before enabling bindings.
- Direct custom-host deep links use the same root/history SPA route set as slug pages; Admin remains on the platform/default host.
- Certificate readiness is external operational state and is not represented in D1.

## Scope Mode

Three-step executable feature slice.

## Engineering Closure Check

- architecture_surface: `apps/worker/{migrations,src,test}`, `packages/db/src/schema.ts`, `apps/web/{public,src}`, `.github/workflows/deploy.yml`, deployment docs
- dependencies_known: yes; existing D1, Drizzle, Hono, Zod, Pages Functions, React Router, TanStack Query, and Vitest patterns are sufficient
- verification_path: focused persisted-contract tests; Host-routing and cache-isolation tests; UI/type/lint tests; local D1 migration; Pages-runtime two-host browser matrix; affected public-path CPU/parity evidence
- blockers: none
- replan_condition: if Pages cannot resolve Host ownership before cache/proxy decisions without exposing an unauthenticated broad lookup or breaking the released CPU profile, stop and revise the Technical Design rather than adding an unplanned service or stale ownership cache

## Brainstorm Trace

| Item | Status | Target | Reason |
| ---- | ------ | ------ | ------ |
| BR-REQ-1 | covered_by_step | U1, U3 | Persistence, API, and Admin UI expose zero or one hostname per page. |
| BR-REQ-2 | covered_by_step | U1 | Zod normalization and a unique partial index enforce the hostname contract. |
| BR-REQ-3 | covered_by_step | U2 | Pages resolves trusted request hostname into the existing resolved page identity. |
| BR-REQ-4 | covered_by_step | U2, U3 | Pages routing, SPA bootstrap, API paths, metadata, and all cache layers retain one page identity. |
| BR-REQ-5 | covered_by_step | U2 | Existing `/status/:slug` routes remain directly usable. |
| BR-REQ-6 | covered_by_step | U3 | Admin UI and bilingual deployment docs provide manual setup guidance. |
| BR-REQ-7 | covered_by_step | U2, U3 | Automated two-host regressions and Pages-runtime HITL warm both request orders. |
| BR-DEC-1 | captured_as_decision | D6 | Unknown, inactive, or invalid custom hosts fail closed with no default fallback. |
| BR-DEC-2 | captured_as_decision | D7 | Custom hostname is canonical; slug access does not redirect in this slice. |
| BR-DEC-3 | captured_as_decision | D5 | Existing slug/page-ID identity and snapshot/cache mechanisms are reused. |
| BR-OUT-1 | out_of_scope | Spec Non-goals | Cloudflare API automation and API Token storage are unnecessary for manual binding. |
| BR-OUT-2 | out_of_scope | Spec Non-goals | DNS, Pages domain, TLS management, and polling remain Cloudflare/operator responsibilities. |
| BR-OUT-3 | out_of_scope | Spec Non-goals | Aliases, wildcard domains, and apex/`www` redirect policy require a later domain-lifecycle design. |
| BR-OUT-4 | out_of_scope | Spec Non-goals | Tenant/RBAC and new Cloudflare services are unrelated to Host routing. |

## Devil's Advocate Audit

### Rollback resilience

- U1 is append-only and nullable. If application rollout stops there, no request routing changes and existing pages continue using slug/default paths. Revert code, not an applied migration.
- U2 treats Worker and Pages routing as one coherent release. If either side fails, disable custom-host routing or roll both deployments back; the unused hostname column is harmless.
- Ownership is not cached in this slice, so clearing or replacing a binding immediately removes the old Host route. Old HTML cache entries cannot be read before re-resolution.
- U3 adds UI/docs only after routing is proven. A UI failure does not strand data because the Admin API can clear a binding.

### Verification vanity

- U1 tests migrate a real local D1 and exercise duplicate, malformed, reserved, replace, clear, and non-public lookup behavior; checking only the schema text would not prove uniqueness or normalization.
- U2 warms two Host-specific HTML/API caches in A->B and B->A order, then replaces/clears bindings and re-requests the old Host. This can fail on the intended cross-serve and stale-ownership regressions.
- U2 explicitly tests forwarding-header spoofing, conflicting slug paths, Admin/Internal blocking, metadata canonical URL, memory/localStorage/Query qualification, and unknown-host no-store behavior; a single root-page screenshot is insufficient.
- U3 uses `wrangler pages dev`, not Vite alone, because Vite cannot prove `_worker.js` Host routing or HTML metadata injection. CPU/parity checks remain release evidence for affected public paths.

### Spec dilution detection

- Every confirmed `BR-*` item is mapped. The Plan does not reinterpret “custom domain” as documentation-only support or omit UI, API, canonical metadata, history/detail routes, and cache isolation.
- The Plan deliberately adds `UPTIMER_DEFAULT_HOSTS`; without it, fail-closed unknown Host behavior could break the existing Pages default domain or silently expose `default` on arbitrary associated hosts.
- Automation, aliases, wildcard/redirect policy, TLS status, tenant/RBAC, and new services remain explicit non-goals rather than placeholder columns or speculative abstractions.

## Steps

### Step 1

- Step ID: U1
- Result: Status pages persist one validated custom hostname safely
- Verification: `pnpm --filter @uptimer/worker exec vitest run --config vitest.config.ts test/status-page-custom-domain-migration.test.ts test/status-pages-schema.test.ts test/status-page-custom-hostname-schema.test.ts test/admin-status-pages.test.ts test/public-status-pages.test.ts test/public-custom-hostname-resolver.test.ts && pnpm --filter @uptimer/worker migrate:local && bash scripts/verify-u1-custom-hostname-d1.sh` exits zero; a local D1 query proves existing rows remain `NULL` and duplicate non-null canonical hostnames are rejected
- Test scenarios: additive migration preserves every existing page and publication link; create/patch/list returns `custom_hostname`; empty input clears; replacement is atomic; duplicate hostname returns `CONFLICT`; uppercase/trailing-dot input canonicalizes; schemes, paths, ports, wildcards, IP literals, localhost, punycode-invalid, and reserved deployment hosts fail Zod validation; resolver returns only a public active owner; hidden/cleared/unknown hostname returns `NOT_FOUND`
- Discovery cache: apps/worker/migrations/0014_status_pages.sql (status_pages baseline); apps/worker/migrations/0016_status_page_branding_ownership.sql (latest append-only migration style); packages/db/src/schema.ts (Drizzle mirror); apps/worker/src/schemas/status-pages.ts (Admin Zod boundary); apps/worker/src/routes/admin-status-pages.ts (CRUD contract); apps/worker/src/public/status-page.ts (resolved page identity); apps/worker/src/routes/public.ts (narrow resolver route); apps/worker/test/admin-status-pages.test.ts (fake-D1 CRUD conventions); apps/worker/test/public-status-pages.test.ts (public isolation conventions)
- Execution note: test-first
- failure_behavior: If one canonical hostname cannot be enforced by a nullable unique index and validated Admin writes, leave all bindings `NULL` and stop before Pages routing.
- security_considerations: Normalize once at the trust boundary, use parameterized D1 queries, expose no Admin-only data through the Public resolver, and reserve platform/API/Admin/local hosts.
- Depends on: None

### Step 2

- Step ID: U2
- Result: Host-routed public traffic preserves one page identity
- Verification: `pnpm --filter @uptimer/worker exec vitest run --config vitest.config.ts test/pages-homepage-worker.test.ts test/public-status-pages.test.ts test/public-page-keys.test.ts test/snapshots-public-status.test.ts test/snapshots-public-homepage.test.ts && pnpm --filter @uptimer/web typecheck && pnpm --filter @uptimer/web lint` exits zero; focused tests warm two hostnames in both orders and prove replacement/clearing blocks the old owner before any cached HTML is returned
- Test scenarios: configured platform hosts preserve default `/` and unscoped Public API behavior; absent `UPTIMER_DEFAULT_HOSTS` preserves legacy behavior and does not activate custom routing; custom Host root/history/detail routes resolve the assigned slug; unscoped Public API paths rewrite to the assigned slug-scoped path; conflicting `/status/:other-slug`, `X-Forwarded-Host`, and query input cannot override Host ownership; unknown/inactive/cleared hosts return no-store `404`; Admin/Internal routes are unavailable on custom hosts; HTML cache key includes Host and resolved page identity; old cached HTML is ignored after replace/clear; snapshot keys remain numeric page-qualified; canonical and `og:url` use only the validated binding; SPA bootstrap drives existing slug-qualified API, Query, memory, and localStorage keys
- Discovery cache: apps/web/public/_worker.js (Host, proxy, HTML cache, metadata); apps/worker/test/pages-homepage-worker.test.ts (Pages worker harness); apps/web/src/app/router.tsx (public route identity); apps/web/src/app/StatusPageSlugContext.tsx (slug propagation); apps/web/src/api/client.ts (Public API and browser caches); apps/web/src/pages/StatusPage.tsx (Query identity and metadata); apps/web/src/pages/IncidentHistoryPage.tsx (history identity); apps/web/src/pages/MaintenanceHistoryPage.tsx (history identity); apps/worker/src/snapshots/public-page-keys.ts (numeric cache isolation)
- Execution note: characterization-first
- failure_behavior: If any custom-host path cannot prove resolved identity before cache/API access, return no-store `404` for that path rather than using default or slug-derived data; structural changes to the resolver flow require replan.
- security_considerations: Trust only URL hostname, never forwarding headers; resolve before cache; do not expose Admin/Internal APIs; do not forward sensitive headers outside the configured trusted API origin.
- Depends on: 1

### Step 3

- Step ID: U3
- Result: Custom hostname operations are administrator-ready
- Verification: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @uptimer/worker migrate:local && git diff --check` exits zero; `wrangler pages dev` browser verification binds two pages to two local test hostnames, warms A then B and B then A, and confirms visible branding, status/history/detail data, `document.title`, canonical, description, Open Graph/Twitter metadata, Public API, and browser caches stay page-correct; binding replacement/clearing makes the old Host fail closed; controlled Dev Tail/parity checks for affected public resolver/status/artifact paths satisfy the existing under-10-ms release criteria and return `200` for valid hosts
- Verification type: hitl
- Test scenarios: status-page form sets/replaces/clears the optional hostname and renders the resulting HTTPS link; validation errors are actionable; UI does not claim DNS/TLS readiness; deploy workflow derives the Pages project hostname into `UPTIMER_DEFAULT_HOSTS` without adding secrets; English and Chinese docs cover Pages association before DNS, external subdomain CNAME, apex-zone requirement, allowlist, binding order, rollback, and troubleshooting; valid custom hosts work while unknown hosts fail closed; slug and default-host compatibility remain unchanged
- Discovery cache: apps/web/src/pages/AdminDashboard.tsx (status-page management UI); apps/web/src/api/types.ts (Admin contract); apps/web/src/api/client.ts (Admin mutations); apps/web/src/i18n/messages.ts (localized UI copy); .github/workflows/deploy.yml (Pages deployment variables); README.md (quick deploy); docs/deploy-github-actions.md (English operations); docs/deploy-github-actions.zh-CN.md (Chinese operations); docs/configuration-reference.md (English configuration); docs/configuration-reference.zh-CN.md (Chinese configuration); Develop/Worker-CPU-10ms-Release-Readiness.md (release evidence); Develop/Local-Development-Experience.md (local-only operational procedure, when present)
- failure_behavior: If automatic default-host derivation is ambiguous, require explicit `UPTIMER_DEFAULT_HOSTS` and keep custom routing disabled rather than guessing; if Pages-runtime or CPU evidence fails, roll back Worker and Pages together and retain nullable bindings for retry.
- security_considerations: Do not request, store, log, or document a Cloudflare API Token for this feature; keep Admin Bearer behavior on the trusted platform host and avoid exposing operational secrets in UI or tracked docs.
- Depends on: 2

## Design Conformance

Final QA must compare implementation against `docs/specs/status-page-custom-domains.spec.md`, especially platform-host compatibility, resolution-before-cache, no ownership cache, fail-closed unknown hosts, canonical URL ownership, and slug/default compatibility. Local mismatch routes to `rework`; changing any invariant requires `replan`.
