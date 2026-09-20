# Payments

Dodo Payments is the active provider adapter. Checkout uses the authenticated server product catalog; verified raw-body webhooks feed a durable transactional outbox and an independent payment ledger. Browser redirects cannot grant access. Existing entitlements are preserved separately from new provider grants.

The current original offers are $9 once for lifetime account Pro (`pro_lifetime`) and $19/month for a sidebar advertisement (`sidebar_ad_monthly`). The focused `/admin` panel configures their Dodo bindings and reviews paid advertisement creative; it does not restore the former multi-section administration UI or `/dashboard`.

Setup, product creation/binding, provider-price verification, environment isolation, subscription terms, monthly advertisement reconciliation and uncertainty recovery are documented in [Dodo Payments and the original packages](DODO-PAYMENTS.md). Broader provider operation and rollback notes remain in [Provider operations](PROVIDERS.md#dodo-payments). Current UI access and retained backend API capabilities are distinguished in [Administration](ADMIN.md).

Effective PRO access is centralized in `src/modules/payments/entitlements.ts`. It combines preserved legacy access with active, already-started, unexpired grants. Account grants unlock account features; a site grant covers only its purchased site and buyer. Every new checkout stores an immutable `account` or `site` scope. Deleting a site cannot broaden its grant through a nullable foreign key. An older Dodo order without explicit account scope fails closed for account privileges and requires reconciliation, rather than guessing from a missing site reference.

New Dodo access never permanently rewrites `users.is_pro` or a listing's legacy tier. Publication rechecks the account grant inside its transaction and locks the grant against concurrent revocation. Submission limits, pricing upgrade state and badge exemptions use effective access. A site's expired account grant resumes the ordinary badge-check policy; it does not delete or unlist purchased content. Retest deduplication and the 365-result history view currently apply equally to both plans.

The backend retains support for featured and sponsorship products, but the restored pricing UI offers only the original Pro and sidebar advertisement packages. Such additional backend products require an owned website and a site-scoped immutable checkout. Their entitlement checks never increase a performance score or competitive rank. Misconfigured account-wide placement products are excluded from the catalog and rejected before contacting Dodo.

See [advertisement reservations](ADS.md) for protected inventory, pending creative, provider uncertainty and audited release, and [domain analytics](ANALYTICS.md) for transactionally recorded payment facts.
