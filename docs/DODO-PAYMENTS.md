# Dodo Payments and the original packages

All active checkout, webhook, subscription and catalog operations use Dodo Payments. The original offers remain USD $9 once for lifetime account Pro (`pro_lifetime`) and USD $19 each month for one sidebar advertisement (`sidebar_ad_monthly`). Applicable tax is calculated at checkout; clients cannot submit prices or provider product IDs.

## Server configuration

Set `DODO_API_KEY`, `DODO_ENVIRONMENT` (`test_mode` or `live_mode`) and `DODO_WEBHOOK_SECRET` in the server's secret configuration. Never use `NEXT_PUBLIC_` for these values. The application uses its existing `AUTH_SECRET`, `DATABASE_URL` and `SITE_URL`. `PAYMENTS_ENABLED=false` keeps public checkout unavailable while an authorized administrator configures products. The admin catalog can connect to Dodo with an API key while checkout stays disabled. No page load, build, startup or migration creates provider products.

Use separate databases and provider products for test and live environments. Environment changes invalidate previews and block use of another environment's synchronized product. No existing product IDs or customer purchases are silently replaced. Run the existing operator-only `admin:bootstrap` flow after the intended administrator has signed in; the admin page never grants roles by email or client input.

## Admin catalog flow

Open `/admin`. The read-only catalog shows both fixed packages, their binding, local activation and last synchronization state. It reports configuration booleans, never credentials.

1. Choose **Create** for a new unbound package, or **Bind** with the exact existing Dodo product ID. An existing binding cannot be replaced here.
2. Preview the package, price, currency, recurrence, environment, provider operation and reason. This preview has no provider writes. Provider price verification happens during confirmation and blocks activation on mismatch.
3. Confirm the single-use preview within five minutes. The token binds the administrator, exact action, reason, provider ID, environment and current catalog state. Role revocation and concurrent changes invalidate execution.
4. A successful verified operation activates the local package. Public checkout remains disabled until `PAYMENTS_ENABLED=true`; advertising also needs available inventory.

**Verify** reads the bound product and checks the fixed price, currency and monthly frequency. Discounts, purchasing-power parity, pay-what-you-want, trials and localized pricing are rejected. **Update** changes only the name, description and application metadata of products originally created by this catalog. It preserves remote prices, tax settings, entitlements and customer subscriptions. A product bound from outside this application can be verified, but the panel cannot overwrite it.

Dodo requires a total subscription term in addition to the monthly billing frequency. New advertising products use the documented example of **10 years**, charged monthly until cancellation or term end. The preview exposes this term; it is not a ten-year upfront charge. Binding retains an existing product's valid term. Creation currently uses Dodo's `saas` tax category, shown in the preview; review its suitability in the merchant account before confirming. Existing products' tax categories are preserved. The adapter accepts only the enum supported by the installed SDK; it does not invent a marketing-services category.

## Failure and reconciliation

The existing append-only `audit_logs` table provides a durable synchronization journal, scoped to package and Dodo environment. A PostgreSQL advisory lock serializes local operations. A committed `pending` record always precedes the remote call; SDK retries are disabled. This requires no destructive migration or changes to historical payment data. Retain catalog audit records as operational records; deleting them removes the verification needed to sell managed packages.

A timeout, crash or ambiguous provider response must **not** trigger another Create. `pending` and `uncertain` states block duplicate creation. Find the product privately in the Dodo dashboard and use **Bind** with its exact ID, or **Verify** if its ID was recorded. Recovery of an uncertain creation additionally requires matching application, local product ID, package and environment metadata. A recent pending request is protected for at least 60 seconds. A failed reconciliation retains the barrier. Mismatched prices remain inactive and are never overwritten automatically. Definitive provider rejection is recorded as failed and can be retried with a new preview.

Provider responses and credentials are not copied into the journal, API errors or logs. The journal stores reviewed identifiers, state and error codes. No amount is charged by catalog synchronization. Checkout itself verifies the remote product again before creating a hosted session; redirects only permit Dodo's hosted HTTPS checkout domains.

## Advertising inventory and renewals

The admin page manages the existing inventory and reviews paid creative using the existing signed preview/confirmation API. Positions cannot move after creation. Enabling a position occupied by a valid advertisement or a held/paid reservation is blocked; checkout independently locks and reserves capacity. Historical inventory and advertisements are preserved.

Payment alone creates pending creative from the buyer's owned directory listing. An administrator must review and approve it. Monthly approval requires a verified successful payment for the current provider period and a matching active subscription entitlement. Display ends at the paid provider period end, including when approval occurs later; approval does not invent another free month.

An already-approved ad renews only after a verified successful charge covering the subscription's current billing period. The immutable provider payment creation time and payment ID are recorded in the sanitized payment-event ledger after server-side binding verification; mutable webhook delivery/order timestamps never prove a new charge. A subscription event without that charge cannot activate creative or extend access. A delayed payment event can complete a paid reservation even after a newer subscription event, while the newer subscription state is preserved. Scheduled cancellation retains access while Dodo still reports an active paid period. Terminal cancellation, expiry or failure deactivates the placement. Retryable `on_hold` subscriptions stop display but retain inventory because Dodo may charge again; another buyer cannot purchase that position during payment recovery. Full refunds and disputes suspend the affected creative and remain in the ledger for reconciliation.

## Webhooks and verification

Configure the Dodo webhook destination to the application's existing `/api/webhooks/dodo` route and use the matching webhook secret. The current raw-body signature verification, durable event/outbox ledger, server-side payment/subscription retrieval, immutable checkout snapshots and idempotent entitlements remain in place. A success query parameter never grants access.

Local tests mock every provider call and use only isolated `tfw_test_*` loopback databases. They cover concurrent Create, signed previews, uncertain recovery, binding and price mismatch, environment isolation, metadata-only update, monthly approval, paid renewals, cancellation and inventory retention. Passing these tests does not claim that an unconfigured merchant account, webhook delivery or live payment was tested.

## Historical provider data

The retired provider has no active SDK, checkout route, webhook handler, environment dependency or application function. The two original `polar_checkout_id` / `polar_subscription_id` database columns and their baseline migration fingerprints remain inert to preserve imported history. The log redactor still recognizes old token formats so historical credentials cannot leak. Removing those columns would require a separately reviewed data migration and is unnecessary for Dodo-only operation.

## Verified provider references

- [Create Product](https://docs.dodopayments.com/api-reference/products/post-products): required product name, typed price and tax category.
- [Update Product](https://docs.dodopayments.com/api-reference/products/patch-products): selective PATCH fields; this application deliberately omits price.
- [Subscriptions](https://docs.dodopayments.com/features/subscription): monthly billing frequency, required total term, cancellation and existing-subscription price behavior.

Implementation is checked against the installed `dodopayments` SDK types as well as these official references. Unit and integration tests mock provider mutations; live catalog operations require their separate operator audit and do not establish successful customer checkout or webhook delivery.
