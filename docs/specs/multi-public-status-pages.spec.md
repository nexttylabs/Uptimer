---
title: "Multi-public-status-pages"
status: proposed
date: 2026-07-10
---

# Spec: Multi-public-status-pages

## Task

Support multiple independently addressable public status pages without introducing an Application or multi-tenant administrator model. A status page is an explicit publication boundary for monitors, incidents, maintenance windows, snapshots, and public API reads.

## Output Language

Human-readable prose is English. Paths, schema fields, API names, commands, identifiers, and canonical terms remain literal.

## Confirmed decisions

- `status_pages` and `status_page_monitors` are many-to-many; a monitor can appear on more than one page.
- Page-specific `group_name`, `group_sort_order`, and `sort_order` belong to `status_page_monitors`.
- Incidents and maintenance windows are public only when explicitly linked to a status page. Their existing monitor relations describe affected scope only.
- The existing visible monitors migrate to one default page; `show_on_status_page` is retired from public visibility decisions.
- Initial public addressing is `/status/:slug` and page-scoped API routes. Custom-domain Host resolution, certificate provisioning, RBAC, tenant separation, and per-page notification rules are deferred.
- Public snapshot keys, fragment keys, guard keys, Worker cache keys, Pages HTML cache keys, browser cache keys, and Query keys must include the resolved status-page identity.
- Refresh work is page-scoped and bounded. A monitor or page-link change marks only affected pages dirty; scheduled/internal continuation processes a bounded batch and preserves the Free Plan CPU profile.

## Contract surface

- D1 migration and `packages/db/src/schema.ts`
- Worker admin/public Zod schemas and `apps/worker/src/routes/{admin,public,public-hot}.ts`
- `apps/worker/src/public/{data,status,visibility,homepage-guard-state}.ts`
- `apps/worker/src/{snapshots,internal,scheduler,fetch-handler}.ts`
- Pages proxy/cache worker at `apps/web/public/_worker.js`
- Web router, API client, query/cache state, status history pages, and admin dashboard

## Compatibility and migration

- A new append-only migration creates a single default status page and links every existing `monitors.show_on_status_page = 1` monitor to it, preserving current public output.
- Existing unscoped public endpoints remain aliases for that default page during this executable slice. New page-scoped endpoints are authoritative.
- API responses gain `status_page` metadata where necessary. No data is deleted by the migration; old visibility data is retained until a later cleanup migration.
- Existing global settings remain shared. Per-page branding/settings are intentionally not part of this slice.

## Security and integrity

- Public page resolution accepts only normalized, validated slugs. Unknown pages return the established `NOT_FOUND` error shape.
- Every public monitor, latency, uptime, outage, incident, maintenance, and analytics read verifies that its resource is linked to the resolved page.
- Admin mutations validate referenced IDs and atomically replace link rows. Delete flows remove page links before deleting their parent resource.
- Cache keys never use an untrusted raw header and never omit the resolved page ID, preventing cross-page response or HTML leakage.

## Acceptance criteria

1. An administrator can create, update, list, and delete status pages and assign monitors, incidents, and maintenance windows to them.
2. `/status/:slug` renders only the selected page's monitors and explicitly assigned incidents/maintenance windows; a shared monitor may render on multiple pages with independent grouping/order.
3. All page-scoped public detail/history endpoints reject a resource outside the selected page.
4. The default page preserves the prior public page's monitor visibility after migration.
5. Snapshot, fragment, guard, Worker cache, Pages HTML cache, browser cache, and query cache cannot return page A data for page B.
6. Scheduled refreshes dirty and publish only affected pages in bounded batches; existing single-page behavior remains covered.
7. Focused Worker and web tests, workspace lint/typecheck/tests, local migration, and the required CPU-tail/parity evidence pass before release.

## Roadmap

### Executable slice

Implement explicit pages, page-scoped public reads, default-page compatibility, safe cache/snapshot isolation, page-scoped refresh, and management UI.

### Deferred phase: custom domains

Map validated hostnames at the Pages edge to a resolved page ID, include that identity in all proxy/cache keys, and separately configure Cloudflare domains/certificates. Promote only after `/status/:slug` is released and cache isolation has production evidence.

### Deferred phase: tenancy and notification policy

Add administrator isolation, per-page credentials, and page-specific notification channels only with a dedicated authorization/data-ownership design. Current `ADMIN_TOKEN` stays global.
