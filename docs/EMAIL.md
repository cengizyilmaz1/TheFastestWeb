# Email

Microsoft Graph app-only delivery replaces the retired email integration. Typed notification templates, per-category preferences and durable delivery/outbox records sit behind the `EMAIL_ENABLED` gate. Graph acceptance is recorded separately from delivery. Ambiguous sends require reconciliation rather than automatic duplication.

Mailbox permissions, credentials, sender scoping, throttling, uncertainty recovery, signed unsubscribe and template coverage are documented in [Provider operations](PROVIDERS.md#microsoft-graph-email). Authenticated backend APIs retain preferences and notification read state; the former account dashboard UI has been removed.

First verified Google sign-in records one welcome event; returning and concurrent sign-ins preserve the existing identity. Publishing a listing or approving a pending listing records its publication event. Claim issuance records a notification without storing or emailing the ownership proof token. These events commit with their domain transaction. Messages expose only validated site, score, ranking, period and internal destination fields. Rendering remaps links to removed dashboard/claim/competition pages to `/submit`. The inactivity template is available but no inactivity campaign is scheduled without a defined consent and activity policy.
