# Production handoff before DNS cutover — 2026-09-20

The target is **https://thefastestweb.site** on the existing Coolify server. This records preparation and remaining checks; it does not claim that the final release is deployed or that customer checkout, email delivery or interactive Google login has passed. Routing and source/image verification are defined in [runtime/PRODUCTION.md](../runtime/PRODUCTION.md).

## DNS changes

Replace the existing website records with:

| Type | Name | Target |
|---|---|---|
| A | `@` | `54.36.101.109` |
| CNAME | `www` | `thefastestweb.site` |

The read-only check through resolver `1.1.1.1` on 2026-09-20 still returned apex A `76.76.21.21` and `www` CNAME `cname.vercel-dns.com`. It returned no AAAA address for either hostname. Recheck A, CNAME and AAAA immediately before cutover; do not retain an AAAA record directing IPv6 visitors to another server. No DNS changes were made by this check. Preserve unrelated MX/TXT and service records.

## Verified preparation and remaining provider checks

- **Screenshots/R2:** screenshot media is already active through the shared service with a dedicated `thefastestweb` scope. The remaining R2 requirement is a separate, private offsite database-backup bucket and scoped credentials. Configure backup retention/encryption and prove an isolated restore; screenshot storage is not a database backup.
- **Google:** a cookie-free authorization probe accepted `https://thefastestweb.site/api/auth/callback/google` and returned `interaction_required`. It did not call the callback or exchange tokens. Complete a real sign-in after DNS/HTTPS cutover and verify existing ownership is preserved.
- **PageSpeed:** worker requests using both the primary and backup API keys returned HTTP 200 with measurement results. This verifies provider access, not a guarantee about future quota or measurements.
- **Microsoft 365:** token acquisition and application `Mail.Send` permission were verified. No email was sent; sender mailbox access and delivery still need a controlled acceptance check.
- **Dodo:** the two live catalog packages are ready: $9 once for lifetime Pro and $19/month for a sidebar ad. The existing webhook target is `/api/webhooks/dodo` on the canonical domain. Catalog synchronization does not establish successful checkout, signed webhook delivery or entitlement activation; verify those separately after routing reaches this application.
- **DataFast:** the matched provider website now uses `thefastestweb.site`. Settings and analytics metadata reads confirmed the change; all other website settings were preserved. Production tracking configuration uses this same apex. Preview-host traffic remains excluded by the application's canonical-origin checks. No synthetic visitor, bot or payment event was sent to the provider.

## Release and cutover order

1. Complete the release checks, commit and push. Prove that local HEAD, GitHub `main` and Coolify's pinned source SHA match. Record the successful deployment/build and bind its web, worker and scheduler image IDs to that source, as described in [the production procedure](../runtime/PRODUCTION.md#bind-source-revision-to-running-images). Do not infer this equality from a mutable image tag.
2. Apply the reviewed DNS records, then verify DNS propagation and valid HTTPS certificates for apex and `www`. Confirm HTTP redirects to HTTPS and `www` permanently redirects to the apex while preserving path/query. Check all service readiness endpoints, canonical URLs, production robots/sitemaps and preview-host `noindex`.
3. Finish the controlled authentication/provider checks and private backup restore verification. Review pending jobs and notification history before enabling recurring work.
4. Keep **`SCHEDULER_ENABLED=false` before cutover** to avoid prelaunch scheduled measurement and notification generation. Keep the scheduler process running: it still dispatches existing outbox jobs. Enable scheduled generation only after the cutover checks pass and the old scheduler is stopped; verify the first cycle and its workload.

Keep rollback images and private runtime/backup evidence. Changing routing must not recreate databases, delete volumes or replace historical data.
