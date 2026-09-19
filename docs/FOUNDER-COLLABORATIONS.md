# Founder collaboration consent

A site may list multiple founders. Linking your own founder profile to your own site remains a direct authenticated operation. Attributing someone else's profile requires a durable invitation and that profile owner's authenticated acceptance. An invitation does not transfer site ownership, grant dashboard control or publish a private website.

`/api/founders/collaborations` is private and sends `Cache-Control: no-store`:

| Method | Input | Action |
|---|---|---|
| GET | No body | Bounded incoming/outgoing invitations, owned-site collaborators and your own links |
| POST | `{siteId,founderSlug}` or `{siteId,founderId}` | Current site owner invites one existing public account-owned founder profile |
| PATCH | `{invitationId,decision:"accept"\|"reject"\|"revoke"}` | Invited account accepts/rejects; current site owner revokes |
| DELETE | `{siteId,founderId}` | Current site owner removes attribution, or that founder withdraws their own attribution |

Mutations require same-origin authentication and shared rate limits. Invitation creation permits at most 20 requests per account/day; responses/removals permit 60/hour. There is no automatic email and no secret invitation URL. The invited account sees the request in its collaboration dashboard.

Invitations expire after seven days using the database clock. One pending invitation per site/profile is enforced by a partial unique index; retries/concurrent requests return the existing unexpired request rather than extending it. A new invitation after expiry retains the old terminal record. Statuses are pending, accepted, declined, revoked and expired.

Acceptance locks the site, profile and invitation in a consistent order. The original inviting account must still own the site, the same invited account must still own a public profile, the site must not be removed/suspended/archived, and the invitation must remain pending/unexpired. Invalidated acceptance durably expires/revokes the invitation before returning a conflict. Concurrent acceptances create one relationship. Replaying an already consumed invitation acknowledges its status without recreating a subsequently removed link. Concurrent owner withdrawal and acceptance cannot leave a relationship behind.

Private founder names/slugs are masked from other accounts' collaborator management; only the relationship ID remains available for removal. Public founder/site pages retain their existing visibility guards. Former invitations cannot expose a changed private-site title when the recipient has neither a current relationship nor a valid invitation. Read projections display the effective expired/unavailable status even before a subsequent mutation stores the terminal status.

The inbox/outbox return at most 50 invitations each. Owned-site and own-link lists are bounded at 100; owned-site collaborator rows are bounded at 1,000. No account email, owner account UUID or token is returned. Relationship removal changes only the founder association and pending invitations, preserving site ownership, measurements, awards and ranking history.

`0007_founder_invitations` is additive. It does not backfill invitations, change existing attribution or rewrite historical rows. Real PostgreSQL tests cover authorization, concurrency, expiry, current ownership/privacy checks, replay after removal, private projections and API origin enforcement.

The public profile also presents technologies, earned badges, finalized ranking history, weekly overall wins, best overall finish, the best currently measured website and recent improvements. Mobile and desktop are separate selections. The score average gives equal weight to each displayed website's latest complete `psi-v2-two-sample` lab result; legacy/incomplete/future measurements are excluded. Recent improvements compare the latest two eligible results when the latest is within 30 days. Rankings require closed `ranking-v1` periods under that same measurement method. Every projection rechecks active/public/nonarchived website attribution in a read-only consistent transaction. Removing attribution or making a website private hides its profile statistics without modifying retained evidence. Missing measurements/rankings display explicit empty states. Lists are bounded to 100 websites, 24 recent placements, 12 badges and eight recent improvements; the UI states these limits. Four additional PostgreSQL cases cover device/method isolation, actual ranking/award evidence, privacy changes and legacy-only empty states.
