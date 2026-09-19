# TheFastestWeb — Local Scripts

All scripts live in `scripts/local/` and are meant to be run manually from the project root.

They read environment variables from `.env.local` (via the shared `env.mjs` helper).

## Prerequisites

```bash
# Install dependencies (if not already)
npm install postgres resend puppeteer-core
```

Required env vars in `.env.local`:
- `DATABASE_URL` — Supabase Postgres connection string
- `RESEND_API_KEY` — Resend email API key (for trend-alert, weekly-recap, check-badges, inactivity)
- `GOOGLE_PSI_API_KEY` — Google PageSpeed Insights API key (for retest)
- `GOOGLE_PSI_API_KEY_BACKUP` — Backup PSI key, optional (for retest)
- `NEXT_PUBLIC_SITE_URL` — Base URL, defaults to `https://thefastestweb.site`

Local-only requirement for check-badges.mjs's rendered-DOM fallback: a local Google Chrome install at the hardcoded path in the script (`/Applications/Google Chrome.app/...`). In production/Vercel it uses `@sparticuz/chromium-min` instead.

---

## 1. retest.mjs — Daily Speed Retests

**What it does:** Retests every listed site using the Google PSI API (2 runs per site, averaged), saves the results to the `speed_tests` table, and updates each site's current score and metrics in the `sites` table.

**Does NOT** send any emails. Run `trend-alert.mjs` after this for alerts.

```bash
node scripts/local/retest.mjs
```

**How it works:**
1. Queries all sites where `is_listed = true`
2. For each site, runs PSI twice and averages the results (score, FCP, LCP, CLS, TBT, TTI, SI)
3. Inserts a new `speed_tests` row
4. Updates the site's `current_*` metric columns and `last_tested_at`
5. Recalculates `current_score` (latest test score) and `trend` (% change)
6. Waits 5 seconds between sites to avoid rate limiting
7. If the primary PSI API key fails (429/403/5xx), automatically retries with the backup key

**When to run:** Daily, before trend-alert.mjs. The Vercel cron (`/api/cron/retest`) does this automatically at 3AM UTC, so only run locally for manual retests or debugging.

---

## 2. trend-alert.mjs — Speed Trend Alerts

**What it does:** Analyzes each site's recent speed test history and sends an email alert to the owner if their site is consistently declining.

```bash
# Preview without sending emails
node scripts/local/trend-alert.mjs --dry-run

# Actually send alerts
node scripts/local/trend-alert.mjs
```

**Algorithm (window comparison):**
1. For each listed site with an owner, fetches the last 6 speed tests
2. Splits into two windows: previous 3 (older) vs recent 3 (newer)
3. Averages each window
4. If recent avg is >= 15 points lower than previous avg, sends an alert

This smooths out single-day Lighthouse noise. A bad test day gets averaged with normal days, so it won't trigger a false alarm. Only a **sustained shift** to lower scores triggers an alert.

Requires 6 data points (6 days of retests) before it can run.

**Examples:**

| Previous 3 (avg) | Recent 3 (avg) | Drop | Alert? | Why |
|---|---|---|---|---|
| 95, 97, 94 (95) | 78, 80, 76 (78) | 17 | Yes | Sustained drop to lower bracket |
| 90, 92, 88 (90) | 72, 74, 70 (72) | 18 | Yes | Clear performance regression |
| 95, 97, 94 (95) | 94, 87, 90 (90) | 5 | No | One bad day averaged out |
| 97, 94, 95 (95) | 97, 94, 87 (93) | 2 | No | Normal Lighthouse variance |
| 85, 88, 82 (85) | 80, 83, 78 (80) | 5 | No | Minor fluctuation, not a real drop |

**When to run:** After `retest.mjs`, so the latest scores are in the database. The Vercel cron handles this automatically (Phase 2 of the retest route), so only run locally when testing or for manual checks.

---

## 3. weekly-recap.mjs — Weekly Recap Emails

**What it does:** Sends a weekly performance recap email to each site owner showing their sites' current scores, rank changes, and sponsored ad slots.

```bash
# Preview without sending emails
node scripts/local/weekly-recap.mjs --dry-run

# Actually send recaps
node scripts/local/weekly-recap.mjs
```

**How it works:**
1. Queries all listed sites ranked by score
2. Gets each site's previous score (the test before the latest)
3. Groups sites by owner
4. Fetches active ad slot sponsors
5. Sends each owner a recap email with their sites' scores, changes, ranks, and sponsor mentions

**When to run:** Once a week (Mondays). No automated cron for this yet — run it manually.

---

## 4. check-badges.mjs — Badge Presence Enforcement

**What it does:** Checks every free-tier site that requires the badge (`requires_badge = true`) still has the TheFastestWeb badge embedded on its homepage. Enforces removal for sites that drop it.

```bash
# Preview without sending emails or touching the DB
node scripts/local/check-badges.mjs --dry-run

# Actually run enforcement
node scripts/local/check-badges.mjs
```

**How it works:**
1. Fetches the raw HTML of each site's homepage and looks for the badge image URL
2. If not found in raw HTML, falls back to a headless-Chrome (Puppeteer) render check — catches badges injected client-side by JS/SPA sites that never appear in the initial server response
3. **Pass:** if the site was previously warned or unlisted, restores it (`is_listed = true`, clears `badge_warning_sent_at`)
4. **First failure:** unlists the site, sets `badge_warning_sent_at = now()`, sends a warning email
5. **Second failure (already warned):** permanently deletes the site and all its `speed_tests` rows, sends a deletion email
6. 1 second delay between sites

**Does NOT apply to Pro sites** — no badge requirement on Pro.

**When to run:** Periodically (not strictly daily) — this is destructive on repeated failures, so don't run it more than once a day.

---

## 5. inactivity.mjs — Inactivity Enforcement

**What it does:** Pauses and eventually removes listings for free-tier owners who've stopped visiting the site, so stale/abandoned listings don't clutter the leaderboard forever. Pro users are always exempt.

```bash
# Preview without any DB writes or emails
node scripts/local/inactivity.mjs --dry-run

# Run for real
node scripts/local/inactivity.mjs
```

**How it works (three passes):**
- **Pass 0 — Grandfather warning:** users who signed up before activity tracking existed (`last_active_at` has always been `NULL`) get one warning email, then get put on the same pause/removal clock as everyone else (7-day grace instead of 10, so they don't stay permanently exempt).
- **Pass 1 — 10-day pause:** free users inactive >10 days (or grandfathered >7 days) with a listed site not yet paused → sets `monitoring_paused = true`, sends a pause-warning email.
- **Pass 2 — 30-day removal:** free users inactive >30 days (or grandfathered >27 days) with a still-listed site → sets `is_listed = false`, sends a removal email.
- 600ms delay between emails (Resend rate limit), capped well under the 100/day free-plan quota.

**When to run:** Periodically, not strictly daily.

---

## Typical Daily Workflow

```bash
# 1. Retest all sites (updates DB)
node scripts/local/retest.mjs

# 2. Check for declining trends and send alerts
node scripts/local/trend-alert.mjs --dry-run   # preview first
node scripts/local/trend-alert.mjs              # then send
```

## Typical Weekly Workflow (Mondays)

```bash
# 1. Retest (if not already done today)
node scripts/local/retest.mjs

# 2. Trend alerts
node scripts/local/trend-alert.mjs

# 3. Weekly recap
node scripts/local/weekly-recap.mjs --dry-run   # preview first
node scripts/local/weekly-recap.mjs              # then send
```

---

## Shared: env.mjs

Reads `.env.local` from the project root and exports all variables as a plain object. Used by all scripts.
