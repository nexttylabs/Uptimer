---
title: "feat: private status page administrator access"
type: feat
status: proposed
date: 2026-07-12
origin: "Confirmed imm-brainstorm manifest for administrator-only private status pages"
---

# Iteration Plan

## Task

- Summary: Allow an authenticated administrator to access private status pages on platform-host `/status/:slug` routes without exposing page existence or private content through caches.
- Origin: The user selected administrator-only access, then confirmed that private custom-host access is excluded from this slice.
- Spec: docs/specs/private-status-page-admin-access.spec.md
- Brainstorm manifest: BR-REQ-1, BR-REQ-2, BR-REQ-3, BR-REQ-4, BR-REQ-5, BR-DEC-1, BR-DEC-2, BR-OUT-1, BR-OUT-2, BR-OUT-3

## Output Language

Human-readable prose is English. Paths, schema fields, API names, commands, identifiers, and canonical terms remain literal.

## Research

- `apps/worker/src/public/status-page.ts` currently hardcodes `is_public = 1` for slug, ID, and Host resolution, so Admin authorization cannot unlock a private page today.
- `apps/worker/src/routes/public.ts` already uses `hasValidAdminTokenRequest()` and `private, no-store` responses for optional authorized public data, providing one existing token and cache policy to reuse.
- `apps/web/src/api/client.ts` already attaches the stored Admin Bearer Token to Public API calls and bypasses memory/persisted public caches while authorized.
- `apps/web/src/app/ProtectedRoute.tsx` and `apps/web/src/pages/AdminLogin.tsx` already implement token verification and an internal post-login return path; the private-page flow should reuse that behavior without making public status pages globally protected.
- `apps/web/public/_worker.js` resolves and caches HTML before React can read `localStorage`. Therefore private custom-host access cannot safely reuse the current Host resolver, and private slug HTML must not use stale branded/shared cache fallback.
- `docs/solutions/multi-status-page-cache-isolation.md` requires resolved page identity before cache access and confirms that custom Host ownership remains public-only.
- Planner research dispatch used solo fallback `cost_scope_mismatch`: the security and cross-module boundary is explicit, but cache-first repository evidence already resolves the architecture and verification surfaces; additional advisory fan-out would not change decomposition.

## Decisions

- D1: Reuse the existing Admin Bearer Token and `hasValidAdminTokenRequest()`; do not introduce page credentials or sessions.
- D2: Resolve a private slug only for a valid Admin request and return the same `404 NOT_FOUND` as an unknown page otherwise.
- D3: Keep Host resolution public-only. Private pages are accessible only through platform/default-host `/status/:slug` in this slice.
- D4: Treat private HTML, API errors, and API success responses as `private, no-store`; authorized browser requests bypass public memory and persisted caches.
- D5: Serve a generic no-store SPA shell when Pages cannot fetch public slug data, then let React verify credentials and retry. Never use stale branded HTML for a possibly private slug.
- D6: Reuse the existing Admin login return-location flow, preserving only a React Router same-origin location and resetting auth-sensitive queries when auth changes.
- D7: Ship Worker, Pages, and Web changes as one release unit; no D1 migration is needed.

## Assumptions

- The administrator accesses private pages through the same platform/default origin used for `/admin/login`, so the existing origin-scoped `localStorage` token is available.
- Existing page-scoped endpoints cover every public view used by StatusPage, incident history, maintenance history, and monitor analytics.
- Returning `404` for an unauthorized private page is preferable to displaying a dedicated “private” state because existence concealment is a confirmed requirement.
- Existing Admin Token rotation and logout semantics remain sufficient for this single-admin product.

## Scope Mode

Two-step executable security slice.

## Engineering Closure Check

- architecture_surface: `apps/worker/src/{public,routes,middleware}`, `apps/web/{public,src}`, focused Worker/Pages/Web tests
- dependencies_known: yes; existing Hono auth, React Router, AuthContext, API client, TanStack Query, and Vitest patterns are sufficient
- verification_path: focused authorization matrix tests; cache-policy and stale-HTML regressions; route/login-return tests; full workspace lint/typecheck/test; platform-host browser matrix
- blockers: none
- replan_condition: if a page-scoped endpoint cannot consume one authorization-aware resolved page contract, or if Pages must receive/expose the Admin Token to avoid shared HTML caching, stop and revise the Spec instead of adding cookies, query credentials, or private custom-host support

## Brainstorm manifest

- BR-REQ-1
- BR-REQ-2
- BR-REQ-3
- BR-REQ-4
- BR-REQ-5
- BR-DEC-1
- BR-DEC-2
- BR-OUT-1
- BR-OUT-2
- BR-OUT-3

## Brainstorm Trace

| Item | Status | Target | Reason |
| ---- | ------ | ------ | ------ |
| BR-REQ-1 | covered_by_step | U1, U2 | Worker authorizes private slug APIs and Web exposes them through the existing authenticated browser flow. |
| BR-REQ-2 | covered_by_step | U1 | Missing or invalid authorization uses the same no-store `404` as an unknown slug. |
| BR-REQ-3 | covered_by_step | U1, U2 | Worker and Pages enforce `private, no-store`; authorized Web requests bypass public caches. |
| BR-REQ-4 | covered_by_step | U1, U2 | The authorization contract covers status, incidents, maintenance, history, and monitor analytics routes used by the UI. |
| BR-REQ-5 | covered_by_step | U2 | `/admin/login` returns to the original safe private route after verification. |
| BR-DEC-1 | captured_as_decision | D1 | Existing Admin Bearer Token and `localStorage` login behavior are reused. |
| BR-DEC-2 | partially_covered | D3 | The user later confirmed a safe narrowing: private custom-host access is deferred because Pages cannot read the platform origin's `localStorage` token before Host resolution. Platform-host privacy semantics remain covered. |
| BR-OUT-1 | out_of_scope | Spec Non-goals | External visitor passwords and share links require a separate credential/session model. |
| BR-OUT-2 | out_of_scope | Spec Non-goals | RBAC, SSO, and page-level tokens exceed the single-admin requirement. |
| BR-OUT-3 | out_of_scope | Spec Non-goals | URL credentials are prohibited because they leak through history, logs, and referrers. |

## Devil's Advocate Audit

### Rollback resilience

- No migration is required. U1 can be reverted without data repair; until U2 ships, private APIs remain usable only by manually supplied valid Admin authorization and otherwise fail closed.
- U2 must deploy with U1 as one release unit. If browser or Pages verification fails, roll back the Worker, Pages worker, and Web route/auth changes together.
- If execution stops midway, public pages retain their current resolver and shared-cache behavior. A private page never becomes anonymous as a fallback.
- Custom Host resolution remains unchanged and public-only, so rollback cannot accidentally expose private custom-host ownership.

### Verification vanity

- U1 tests a matrix of public/private/unknown slugs against missing, invalid, and valid tokens across every slug-scoped endpoint; checking one status endpoint would miss sibling leaks.
- Cache assertions inspect `Cache-Control`, `Vary`, snapshot writes, and authorized/anonymous request order. A `200` assertion alone cannot prove confidentiality.
- U2 tests fresh and stale Pages HTML caches, deep-link refresh, invalid stored token, login return, logout, Query reset, and persisted cache bypass. A successful login screenshot alone is insufficient.
- Browser verification uses the platform Pages runtime and two conflicting pages in both request orders to detect private branding/data leakage.

### Spec dilution detection

- Every original `BR-*` item is mapped. `BR-DEC-2` is explicitly partially covered rather than silently claiming private custom-host support; the user confirmed this narrowing.
- Status, incidents, maintenance, history, monitor detail, and analytics remain in scope even though implementing only the status endpoint would be cheaper.
- Existence concealment, no-store behavior, safe login return, logout cleanup, and stale HTML handling remain acceptance requirements rather than optional hardening.
- No speculative password, session, cookie, RBAC, or schema abstraction is added.

## Steps

### Step 1

- Step ID: U1
- Result: Private slug APIs enforce one administrator access contract
- Verification: `pnpm --filter @uptimer/worker exec vitest run --config vitest.config.ts test/public-status-pages.test.ts test/public-ui-analytics.test.ts test/public-status.test.ts test/public-page-keys.test.ts test/pages-homepage-worker.test.ts` exits zero; focused tests prove public/private/unknown slug behavior for missing, invalid, and valid Admin tokens across status, incident, maintenance, history, latency, uptime, outage, day-context, and uptime-overview routes, including response cache headers and no private snapshot write
- Test scenarios: public slug remains anonymous; private slug without token returns `404`; private slug with invalid token returns identical `404`; unknown slug with valid token remains `404`; private slug with valid token returns only its page-qualified data; all authorized private success/error responses are `private, no-store` with `Vary: Authorization`; public anonymous responses retain existing cache behavior; private Host resolver remains `NOT_FOUND`; no query or forwarding header unlocks a private page; sibling page-scoped endpoints share the same access decision; authorized data is never written to a shared snapshot
- Discovery cache: apps/worker/src/public/status-page.ts (current public-only page resolver); apps/worker/src/middleware/auth.ts (single Admin token validator); apps/worker/src/routes/public.ts (slug-scoped status/history/detail routes and cache policy); apps/worker/src/routes/public-ui-analytics.ts (page-scoped analytics routes); apps/worker/test/public-status-pages.test.ts (page isolation harness); apps/worker/test/public-ui-analytics.test.ts (analytics authorization matrix); apps/worker/test/pages-homepage-worker.test.ts (Pages HTML cache harness)
- Execution note: test-first
- failure_behavior: If any slug-scoped endpoint cannot share the same access result, keep private pages returning `404` on that endpoint and stop for replan rather than shipping partial access or endpoint-specific authorization.
- security_considerations: Reuse `hasValidAdminTokenRequest()`, conceal existence with `404`, parameterize D1 queries, never cache authorized payloads, and leave Host resolution public-only.
- Depends on: None

### Step 2

- Step ID: U2
- Result: Administrators reach private pages through the existing login flow
- Verification: `pnpm --filter @uptimer/web exec vitest run --config vitest.config.ts && pnpm --filter @uptimer/web typecheck && pnpm --filter @uptimer/web lint && pnpm --filter @uptimer/worker exec vitest run --config vitest.config.ts test/pages-homepage-worker.test.ts && git diff --check` exits zero; `wrangler pages dev` browser verification opens a private deep link while logged out, returns through `/admin/login`, renders page-qualified status/history/detail data after login, survives refresh, clears private data on logout, rejects an invalid stored token, and proves public/private pages warmed in both orders never cross-serve HTML or browser caches
- Verification type: hitl
- Test scenarios: public status routes do not require login; anonymous private deep link redirects to login only after `NOT_FOUND`; safe pathname/search/hash return location is preserved; an absolute/external return target cannot be used; successful login returns to the private route; invalid token is cleared and does not loop; authorized Public API calls include Bearer and `no-store`; memory and persisted public caches are bypassed; logout resets auth-sensitive Query keys and removes private content; Pages never caches stale/branded HTML for a possibly private slug; private custom hostname returns no-store `404`; default, public slug, and public custom-host behavior remain unchanged
- Discovery cache: apps/web/public/_worker.js (HTML injection, fallback, and cache policy); apps/web/src/app/router.tsx (status route gate); apps/web/src/app/AuthContext.tsx (token verification and auth-sensitive Query reset); apps/web/src/app/ProtectedRoute.tsx (existing safe login handoff pattern); apps/web/src/pages/AdminLogin.tsx (post-login return); apps/web/src/pages/StatusPage.tsx (initial page query/error routing); apps/web/src/pages/IncidentHistoryPage.tsx (private deep link); apps/web/src/pages/MaintenanceHistoryPage.tsx (private deep link); apps/web/src/api/client.ts (optional Public auth and cache bypass)
- Execution note: characterization-first
- failure_behavior: If Pages cannot distinguish a public optimized response from a possibly private slug without exposing credentials, serve a generic `private, no-store` SPA shell for slug navigations; do not restore stale HTML fallback.
- security_considerations: Keep the Admin Token in origin-scoped `localStorage` only, preserve trusted sensitive-origin forwarding, prohibit URL credentials, validate return navigation as same-origin React Router state, and clear private Query data on logout.
- Depends on: 1

## Design Conformance

Final QA must compare implementation against `docs/specs/private-status-page-admin-access.spec.md`, especially one shared authorization-aware page resolver, indistinguishable unauthorized `404`, public-only Host resolution, private no-store behavior, absence of shared/persisted cache writes, safe login return, and full sibling-endpoint coverage. Local mismatch routes to `rework`; changing any invariant or adding private custom-host access requires `replan`.
