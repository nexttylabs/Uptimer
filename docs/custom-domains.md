# Custom Domains for Status Pages

Uptimer supports one custom hostname per public status page. Cloudflare owns DNS, Pages domain association, and TLS certificates; Uptimer owns only the hostname binding and request routing.

## How it works

1. You associate the hostname with your Cloudflare Pages project in the Cloudflare dashboard.
2. You enter the hostname in the Uptimer admin status-page form.
3. Uptimer's Pages edge worker resolves the request `Host` to the bound status page and serves page-qualified content.

Uptimer does **not** call the Cloudflare API, store a Cloudflare API token, manage DNS records, or provision TLS certificates.

## Prerequisites

- A deployed Uptimer Pages project (the `*.pages.dev` hostname is the default platform host).
- The `UPTIMER_DEFAULT_HOSTS` Pages environment variable must list your platform/default hostnames. The deploy workflow derives the `*.pages.dev` hostname automatically. To add an existing default custom hostname, set `UPTIMER_DEFAULT_HOSTS_OVERRIDE`.

> If `UPTIMER_DEFAULT_HOSTS` is absent, custom-host routing is disabled and all existing behavior is preserved.

## Step 1 — Associate the domain in Cloudflare Pages

In the Cloudflare dashboard → Workers & Pages → your Pages project → Custom domains → Set up a custom domain.

- **Subdomain** (e.g. `status.example.com`): if the zone is not on Cloudflare, add a CNAME record at your DNS provider pointing to `<your-project>.pages.dev`.
- **Apex domain** (e.g. `example.com`): the domain must be a zone on the same Cloudflare account. Configure nameservers to point to Cloudflare.

> Do not add a CNAME record manually without first associating the domain in the Pages dashboard, or the domain will fail to resolve (HTTP 522).

## Step 2 — Bind the hostname in Uptimer

In the admin dashboard → Status Pages → edit a page → Custom Domain field, enter the bare hostname (e.g. `status.example.com`). Save.

- The hostname is normalized to lowercase with no trailing dot.
- Schemes, paths, ports, wildcards, IP literals, and localhost are rejected.
- Each hostname can be bound to at most one status page.

## Step 3 — Verify

Visit `https://status.example.com/`. The page should render the bound status page. Unknown or unbound hosts return a `404` with `Cache-Control: no-store`.

The `/status/:slug` route remains available as a fallback and is not redirected.

## Binding order, replacement, and clearing

- **Replace**: editing the hostname to a new value releases the old hostname immediately (next request resolves to `404`).
- **Clear**: empty the field and save to unbind. The hostname returns `404` on the next request.
- **Delete page**: deleting a status page removes its hostname binding.

There is no ownership cache, so changes take effect on the next request.

## Rollback

- To disable custom-host routing entirely: remove `UPTIMER_DEFAULT_HOSTS` from the Pages environment and redeploy. All hostnames revert to legacy behavior.
- To roll back a single binding: clear the hostname in the admin form.
- The database column is additive and nullable; rolling back application code leaves an unused column.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Custom host returns 404 | Hostname not bound, page not public, or `UPTIMER_DEFAULT_HOSTS` misconfigured | Verify binding in admin; check the page is public; ensure `UPTIMER_DEFAULT_HOSTS` includes the Pages project hostname |
| HTTP 522 | Domain not associated in Cloudflare Pages dashboard | Associate the domain in Workers & Pages → Custom domains before adding DNS |
| Certificate not ready | Cloudflare TLS provisioning pending | Wait; Uptimer does not report certificate status |
| Wrong page served | Hostname bound to the wrong status page | Edit the binding in admin |
| Admin inaccessible on custom host | Admin routes are blocked on custom hosts | Access admin via the platform/default hostname |

## Security notes

- Only the request `Host` header is trusted; `X-Forwarded-Host` and query parameters are ignored.
- Admin and Internal API routes are unavailable on custom hosts.
- A conflicting `/status/:other-slug` path on a custom host returns `404`.
- Uptimer never requests or stores a Cloudflare API token for this feature.
