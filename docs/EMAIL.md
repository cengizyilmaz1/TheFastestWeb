# Email

Microsoft Graph app-only delivery replaces the retired email integration. Typed notification templates, per-category preferences and durable delivery/outbox records sit behind the `EMAIL_ENABLED` gate. Graph acceptance is recorded separately from delivery. Ambiguous sends require reconciliation rather than automatic duplication.

Mailbox permissions, credentials, sender scoping, throttling, uncertainty recovery, signed unsubscribe and template coverage are documented in [Provider operations](PROVIDERS.md#microsoft-graph-email). The account dashboard exposes preferences and in-app notification read state.
