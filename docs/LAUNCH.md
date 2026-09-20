# Production handoff — 2026-09-20

**https://thefastestweb.site** now reaches the application on the existing Coolify server. This records the domain and provider cutover; customer checkout, email delivery and interactive Google login still require their own acceptance checks. Bind each deployed release to its exact source and image IDs using [runtime/PRODUCTION.md](../runtime/PRODUCTION.md).

## DNS changes

The production origin mapping is:

| Type | Name | Target |
|---|---|---|
| A | `@` | `54.36.101.109` |
| CNAME | `www` | `thefastestweb.site` |

After the owner changed DNS, public `/health/ready` returned HTTP 200 from the new application. Cloudflare proxy addresses in public DNS are expected. Both apex and `www` also passed direct-origin TLS validation with Let's Encrypt certificates. HTTP redirects to HTTPS and `www` redirects permanently to the apex, preserving path and query. Coolify retains the canonical, `www` and preview domain metadata. Preserve unrelated MX/TXT and service records.

## Verified preparation and remaining provider checks

- **Screenshots/R2:** the shared service stores approved public WebP media in `thefastestweb-media`, served from `https://media.thefastestweb.site`, and private originals in `thefastestweb-media-private`. Existing objects were copied with content-hash checks and ready public URLs were updated. A new capture and its retention cleanup were verified. The four old source copies remain tracked in private rollback evidence for bounded cleanup. A separate private offsite database-backup bucket, scoped credentials and isolated restore proof remain outstanding; screenshot storage is not a database backup.
- **Google:** a cookie-free authorization probe accepted `https://thefastestweb.site/api/auth/callback/google` and returned `interaction_required`. It did not call the callback or exchange tokens. Complete a real sign-in after DNS/HTTPS cutover and verify existing ownership is preserved.
- **PageSpeed:** worker requests using both the primary and backup API keys returned HTTP 200 with measurement results. This verifies provider access, not a guarantee about future quota or measurements.
- **Microsoft 365:** token acquisition and application `Mail.Send` permission were verified. No email was sent; sender mailbox access and delivery still need a controlled acceptance check.
- **Dodo:** read-only live verification confirmed the two existing synchronized catalog packages: $9 once for lifetime Pro and $19/month for a sidebar ad, matching the application database. No duplicate products or price changes were needed. The active canonical webhook target, required events and runtime signing secret match. Checkout, signed webhook delivery and entitlement activation have not been tested with a real transaction.
- **DataFast:** the matched provider website uses `thefastestweb.site`. The cookieless browser integration requires the provider's `isCookieless` setting; verify it when deploying this release. Preview and private routes remain excluded. Browser Google Analytics loading is removed. Existing opt-outs and browser privacy signals remain effective. No synthetic visitor, bot or payment event was sent to the provider during preparation.
- **Administrator:** the existing `cngzylmzz@gmail.com` account was granted the sole administrator role through the audited bootstrap command. No other administrator or moderator remains. No identity or ownership records were recreated.
- **Public attribution:** 146 previously published founder profiles and 155 public site links were restored from the supplied original snapshot, including 145 existing public avatar sources. Existing visibility choices are preserved. This restoration does not expose current private login-profile fields. A signed-in owner without a public founder record can view a private My Profile page; other visitors continue to receive 404.

## Release and cutover order

1. Complete the release checks, commit and push. Prove that local HEAD, GitHub `main` and Coolify's pinned source SHA match. Record the successful deployment/build and bind its web, worker and scheduler image IDs to that source, as described in [the production procedure](../runtime/PRODUCTION.md#bind-source-revision-to-running-images). Do not infer this equality from a mutable image tag.
2. Recheck production and origin HTTPS, HTTP-to-HTTPS and `www`-to-apex redirects after the deployment. Check all service readiness endpoints, canonical URLs, production robots/sitemaps and preview-host `noindex`.
3. Finish the controlled authentication/provider checks and private backup restore verification. Review pending jobs and notification history before enabling recurring work.
4. Keep **`SCHEDULER_ENABLED=false` before cutover** to avoid prelaunch scheduled measurement and notification generation. Keep the scheduler process running: it still dispatches existing outbox jobs. Enable scheduled generation only after the cutover checks pass and the old scheduler is stopped; verify the first cycle and its workload.

Keep rollback images and private runtime/backup evidence. Changing routing must not recreate databases, delete volumes or replace historical data.
