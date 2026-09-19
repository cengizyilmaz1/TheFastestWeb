# Payments

Dodo Payments is the active provider adapter. Checkout uses the authenticated server product catalog; verified raw-body webhooks feed a durable transactional outbox and an independent payment ledger. Browser redirects cannot grant access. Existing entitlements are preserved separately from new provider grants.

Setup, provider-price verification, subscription/refund behavior, idempotency limitations, ambiguous checkout reconciliation, feature gates and rollback steps are documented in [Provider operations](PROVIDERS.md#dodo-payments). Administrative catalog and audit controls are described in [Administration](ADMIN.md).

Effective PRO access is centralized in `src/modules/payments/entitlements.ts`. It combines preserved legacy access with active, already-started, unexpired grants. Account grants unlock account features; a site grant covers only its purchased site and buyer. Every new checkout stores an immutable `account` or `site` scope. Deleting a site cannot broaden its grant through a nullable foreign key. An older Dodo order without explicit account scope fails closed for account privileges and requires reconciliation, rather than guessing from a missing site reference.

New Dodo access never permanently rewrites `users.is_pro` or a listing's legacy tier. Publication rechecks the account grant inside its transaction and locks the grant against concurrent revocation. Navigation, submission, dashboard and badge exemptions use effective access. A site's expired account grant resumes the ordinary badge-check policy; it does not delete or unlist purchased content. Retest deduplication and the 365-result history view currently apply equally to both plans.

Featured and sponsorship products require an owned website and a site-scoped immutable checkout. Their separate paid discovery placement checks the grant's current buyer, site, start, expiry and source order. They never increase a performance score or competitive rank. Misconfigured account-wide placement products are excluded from the catalog and rejected before contacting Dodo.

See [advertisement reservations](ADS.md) for protected inventory, pending creative, provider uncertainty and audited release, and [domain analytics](ANALYTICS.md) for transactionally recorded payment facts.
