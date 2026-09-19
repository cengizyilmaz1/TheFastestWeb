# Legacy scripts retired in M1

The standalone scripts in this directory were removed. They duplicated application workflows, bypassed central configuration and could alter listings or delete historical performance data after temporary provider failures. Do not recreate their old schedules or run archived copies against the migrated database.

| Retired script | Replacement |
| --- | --- |
| `retest.mjs`, `retest-one.mjs` | Central two-sample performance service and deduplicated BullMQ jobs per site/day/device. |
| `check-badges.mjs` | Badge queue with dry-run prerequisite, evidence and seven-day missing-badge grace. Temporary failures do not remove listings or history. |
| `inactivity.mjs` | No automatic listing removal. Owner pause and audited lifecycle operations preserve historical data. |
| `trend-alert.mjs`, `weekly-recap.mjs` | Transactional notification outbox, compatible-method performance changes and closed weekly results. Graph delivery enforces preferences and idempotency. |
| `migrate-activity-tracking.mjs` | The verified migration baseline and `npm run db:migrate`; never apply old ad-hoc ALTER statements to production. |
| `env.mjs` | Typed `src/config/env.ts`; runtime configuration comes from `process.env`, with local dotenv loading limited to development tooling. |

Badge verification distinguishes `verified`, `missing`, `temporarily_unreachable`, and `invalid_url`. It uses public-only DNS-pinned requests and a constrained Linux Chromium egress proxy. Verification never deletes a site or its speed-test history. Browser runtime is preinstalled and configured with `CHROMIUM_EXECUTABLE_PATH`; no runtime download occurs.

Before enabling a new worker, stop the previous scheduler and verify idempotency, retry behavior, provider credentials, and rollback. None of the removed scripts should run alongside the new worker.
