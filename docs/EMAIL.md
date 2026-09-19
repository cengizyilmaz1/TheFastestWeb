# Email

Microsoft Graph app-only delivery replaces the retired email integration. Typed notification templates, per-category preferences and durable delivery/outbox records sit behind the `EMAIL_ENABLED` gate. Graph acceptance is recorded separately from delivery. Ambiguous sends require reconciliation rather than automatic duplication.

Mailbox permissions, credentials, sender scoping, throttling, uncertainty recovery, signed unsubscribe and template coverage are documented in [Provider operations](PROVIDERS.md#microsoft-graph-email). The account dashboard exposes preferences and in-app notification read state.

First verified Google sign-in records one welcome event; returning and concurrent sign-ins preserve the existing identity. Publishing a listing or approving a pending listing records its publication event. Claim issuance records a dashboard link without storing or emailing the ownership proof token. These events commit with their domain transaction. Dashboard messages expose only validated site, score, ranking, period and internal destination fields. The inactivity template is available but no inactivity campaign is scheduled without a defined consent and activity policy.
