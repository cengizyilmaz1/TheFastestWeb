# Dependency decisions — 2026-09-23

Versions were checked against npm registry metadata and provider documentation. Direct versions and lockfile are pinned; no `npm audit fix --force` was used.

LTS is selected where upstream provides an LTS release channel. These npm libraries do not share an "LTSC" channel: use stable releases supported by the application's peer dependencies. Node 26 is still Current, so production remains on the latest Node 24 LTS patch. Registry `latest` is not a reason to install unsupported ESLint/TypeScript major versions.

| Component | Selected | Decision |
|---|---|---|
| Node / npm | 24.21.0 LTS / 11.19.0 bundled | Latest LTS rechecked against the official release index; local verification and both Dockerfiles use Node 24 |
| Next.js / eslint-config-next | 16.3.6 | Current stable patch in the supported Next 16 release line; framework and lint rules upgraded together |
| React / React DOM | 19.3.0 | Paired stable versions |
| next-auth | 4.24.15 | Stable release replaces v5 beta; Google JWT flow adapted; IDs preserved |
| Drizzle ORM / kit | 0.45.3 / 0.31.11 | Stable patch updates; existing SQL schema and migration history retained |
| AWS SDK S3 / presigner | 3.1138.0 | Matching stable patches in the application and independent screenshot service |
| dotenv / tsx | 18.0.3 / 4.23.15 | Stable patch updates |
| postgres.js | 3.4.9 | One bounded pool with explicit close |
| BullMQ / ioredis | 6.3.8 / 6.0.0 | Redis transport; BullMQ6 declares ioredis>=5 as an optional backend peer; explicit Redis backend verified on Node24 |
| Redis | 8.10.1 | Official Alpine image; authenticated private service with AOF and noeviction |
| esbuild | 0.28.2 | Separate Node24 CJS job entrypoints; production packages remain external |
| TypeScript | 6.0.3 | Compatibility pin: current typescript-eslint 8.70.1 supports >=4.8.4 <6.1.0; TypeScript 7.0.2 is deferred until parser support |
| ESLint | 9.39.5 | Temporary development-only EOL exception: current eslint-plugin-react 7.37.5 still declares peers only through ESLint ^9.7; ESLint 10.11.0 cannot be installed as a supported peer tree. Recheck when that plugin supports 10; do not use --force/--legacy-peer-deps |
| Tailwind | 4.3.3 | Existing CSS architecture retained |
| Puppeteer / Chrome for Testing | 25.12.0 / 154.0.8037.57 | Release notes and installed revisions identify the matching pair; both Dockerfiles and both package trees upgraded together. Linux browser artifact availability checked |
| Vitest | 5.0.1 | Node24 unit and PostgreSQL integration regressions |
| GitHub Actions | checkout 7.0.1 / setup-node 7.0.0 / upload-artifact 7.0.1 | Existing SHA pins match latest official releases; read-only workflow token retained |
| Zod / Pino | 4.6.5 / 10.3.1 | Bounded input/env validation; structured redacted logs |

Removed mandatory Supabase clients, Vercel Chromium helper/config, Polar SDK/routes and Resend. Historical Polar data columns remain unchanged; additive legacy entitlements preserve existing access. New payments use Dodo and asynchronous email uses Microsoft Graph.

Compatible transitive updates removed the previous high-severity advisories. A narrowly scoped override uses `esbuild 0.25.12` beneath `@esbuild-kit/core-utils`, replacing the obsolete development-server dependency inherited from Drizzle kit. It changes no production dependency or global esbuild resolution. The code-generation path must remain covered when kit is upgraded; remove this override once upstream retires the old loader.

CI installs and audits both lockfiles, builds web/jobs and the standalone screenshot API/worker/migrator, and uses the same Node LTS pin. Run `npm outdated` to identify newer releases, then evaluate the compatibility exceptions above before modifying exact pins. Do not change persistent PostgreSQL/Redis major versions as part of npm upgrades.

Verification on 2026-09-23: both dependency installations report **0 known vulnerabilities**, `npm ls --depth=0` resolves both direct dependency trees, and jobs/screenshot bundles build on Node 24.21.0. The installed Puppeteer revision is exactly `154.0.8037.57`. After updating, `npm outdated` reports only the intentional Node type, ESLint and TypeScript major-version exceptions above. These advisory results do not replace runtime smoke checks; Chromium's Linux sandbox must be exercised on the deployment host after rebuilding.

Sources: [Node release status](https://nodejs.org/en/about/previous-releases), [Node release index](https://nodejs.org/dist/index.json), [Next support policy](https://nextjs.org/support-policy), [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [TypeScript ESLint supported versions](https://typescript-eslint.io/users/dependency-versions/), [ESLint support policy](https://eslint.org/version-support/), [React ESLint plugin package metadata](https://registry.npmjs.org/eslint-plugin-react/latest), [Puppeteer 25.12.0 release](https://github.com/puppeteer/puppeteer/releases/tag/puppeteer-core-v25.12.0), [Drizzle's legacy loader issue](https://github.com/drizzle-team/drizzle-orm/issues/5304).
