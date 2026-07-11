---
title: "Multi-status-page admin UI"
status: proposed
date: 2026-07-11
---

# Spec: Multi-status-page admin UI

## Task

Complete the existing Admin experience for managing multiple status pages. Reuse the released status-page model and Admin APIs; add only the missing Web contracts, forms, dashboard controls, publication assignment, and focused API representation needed to edit existing assignments safely.

## Output Language

Human-readable prose is English. Paths, schema fields, API names, commands, identifiers, and canonical terms remain literal.

## Design-depth classification

Medium risk. The change is centered on the Admin Web module but crosses the Web/Worker response contract because existing incident and maintenance list responses do not expose `status_page_ids`, which the edit/display experience needs.

## Affected components

- `apps/web/src/api/types.ts`: status-page and publication-assignment representations.
- `apps/web/src/api/client.ts`: existing `/api/v1/admin/status-pages` CRUD calls.
- `apps/web/src/components/`: a status-page form and status-page selection in incident/maintenance forms.
- `apps/web/src/pages/AdminDashboard.tsx`: a Status Pages tab, mutations, query invalidation, public-page links, and actionable errors.
- `apps/web/src/i18n/messages.ts`: labels for every supported locale.
- `apps/worker/src/routes/admin.ts`: include existing explicit status-page links in incident and maintenance Admin representations.
- Focused Worker tests plus Web typecheck/lint and browser verification.

## Decisions

1. Keep the current tabbed `AdminDashboard`; add one `status-pages` tab instead of introducing a new route or navigation system.
2. Reuse `Card`, `Button`, modal classes, TanStack Query, and `ApiError`. Add no dependency and no general form abstraction.
3. A status-page form edits `name`, `title`, `description`, `slug`, `is_public`, and `monitor_ids`. Monitor grouping/order continues to seed from existing monitor metadata because the current Admin API does not expose page-local ordering controls.
4. Public links use `/status/:slug`. The default `/` compatibility route remains unchanged.
5. Incident creation and maintenance create/edit require an explicit non-empty `status_page_ids` selection, independent from affected `monitor_ids`.
6. Admin incident and maintenance responses include `status_page_ids` so current assignments can be displayed and maintenance edits do not silently replace unknown links.
7. Deletion remains restrictive. The UI reports the existing `CONFLICT` message and directs the administrator to unlink monitors, incidents, and maintenance windows; it does not add force-delete behavior.
8. Slug input is normalized in the UI to lowercase kebab-case for convenience, while Worker Zod validation remains authoritative.

## Invariants

- A monitor may remain linked to multiple status pages; saving page A must not alter page B.
- Publication (`status_page_ids`) and impact (`monitor_ids`) remain separate concepts.
- Status-page mutations invalidate only Admin status-page data; public pages rely on the existing refresh queue and page-qualified cache system.
- No UI action bypasses Admin Bearer authentication.
- An empty status-page selection cannot be submitted for incident or maintenance publication.

## Failure behavior

- Duplicate or malformed slugs show the Worker error without closing the form.
- Failed create/update/delete mutations preserve the current query data and form state.
- Restrictive deletion conflicts remain visible and do not mutate local cache.
- If status pages cannot load, incident and maintenance forms block submission rather than guessing the default page.

## Verification implications

- Worker tests must prove Admin incident/maintenance responses return exact `status_page_ids` and preserve explicit links on update.
- Web typecheck must prove request inputs include required publication assignments.
- Browser verification must create two pages, assign a shared and exclusive monitor, edit one page without changing the other, create an incident and maintenance window with explicit page assignments, open `/status/:slug`, and observe a useful deletion conflict.

## Acceptance criteria

1. The Admin dashboard lists, creates, edits, and restrictively deletes status pages.
2. Each page form manages its name, title, description, validated slug, publication state, and monitor membership.
3. Each status-page row provides a direct public link to `/status/:slug`.
4. Incident creation and maintenance create/edit separately select affected monitors and target status pages.
5. Existing publication assignments are returned by Admin APIs and retained during maintenance edits.
6. Shared monitor membership remains isolated between pages, default `/` behavior is unchanged, and all supported locales have usable labels.
7. Focused Worker tests, Web lint/typecheck, workspace tests, and the browser scenario pass.

## Non-goals

- Custom domains.
- Per-page themes or branding.
- Tenant/RBAC changes.
- Per-page notification policy.
- A new global component library or form framework.
- New page-local drag-and-drop grouping/order API.

## Compatibility and rollback

The database and public routing contracts do not change. Worker response additions are backward-compatible. The Web deployment can be rolled back independently; existing Admin APIs and public pages continue to work. If Worker and Web deploy separately, deploy the additive Worker representation first so the new Web can read `status_page_ids` immediately.
