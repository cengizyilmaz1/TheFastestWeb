# Legacy scripts retired in M1

The standalone scripts in this directory were removed. They duplicated application workflows, bypassed central configuration and could alter listings or delete historical performance data after temporary provider failures. Do not recreate their old schedules or run archived copies against the migrated database.

| Retired script | Replacement |
| --- | --- |
| `retest.mjs`, `retest-one.mjs` | The centralized performance service; scheduled execution moves to deduplicated BullMQ jobs in M2. |
| `check-badges.mjs` | Authenticated `/api/verify-badge` and `getVerifiedBadge()` in `src/infrastructure/browser/badge-verification.ts` provide individual checks in M1. Scheduled checks arrive in M2; grace periods and non-destructive enforcement are M8 work. |
| `inactivity.mjs` | No automatic listing removal in M1. A future lifecycle job must preserve permanent listings and historical measurements. |
| `trend-alert.mjs`, `weekly-recap.mjs` | Queue-backed notification jobs in M2 and Microsoft Graph delivery in M3; user preferences and deduplication must be enforced before scheduling. |
| `migrate-activity-tracking.mjs` | The verified migration baseline and `npm run db:migrate`; never apply old ad-hoc ALTER statements to production. |
| `env.mjs` | Typed `src/config/env.ts`; runtime configuration comes from `process.env`, with local dotenv loading limited to development tooling. |

Badge verification distinguishes `verified`, `missing`, `temporarily_unreachable`, and `invalid_url`. It uses public-only DNS-pinned requests and a constrained Linux Chromium egress proxy. Verification never deletes a site or its speed-test history. Browser runtime is preinstalled and configured with `CHROMIUM_EXECUTABLE_PATH`; no runtime download occurs.

Before enabling a new worker, stop the previous scheduler and verify idempotency, retry behavior, provider credentials, and rollback. None of the removed scripts should run alongside the new worker.
