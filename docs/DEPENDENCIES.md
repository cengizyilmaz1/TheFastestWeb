# Dependency decisions — 2026-09-19

Versions were checked against npm registry metadata and provider documentation. Direct versions and lockfile are pinned; no `npm audit fix --force` was used.

| Component | Selected | Decision |
|---|---|---|
| Node | 24.21.0 LTS | Local official Windows archive SHA256 checked; Docker Linux image uses same runtime |
| Next.js / eslint-config-next | 16.3.5 | Current stable upgrade from 16.1.6 |
| React / React DOM | 19.3.0 | Paired stable versions |
| next-auth | 4.24.15 | Stable release replaces v5 beta; Google JWT flow adapted; IDs preserved |
| Drizzle ORM / kit | 0.45.2 / 0.31.10 | Existing SQL schema retained; guarded migration runner replaces incomplete history |
| postgres.js | 3.4.9 | One bounded pool with explicit close |
| BullMQ / ioredis | 6.3.8 / 6.0.0 | Redis transport; BullMQ6 declares ioredis>=5 as an optional backend peer; explicit Redis backend verified on Node24 |
| Redis | 8.10.1 | Official Alpine image; authenticated private service with AOF and noeviction |
| esbuild | 0.28.2 | Separate Node24 CJS job entrypoints; production packages remain external |
| TypeScript | 6.0.3 | Compatibility pin: typescript-eslint's supported range is below 6.1; TS7 upgrade deferred until parser support |
| ESLint | 9.39.5 | Explicit temporary tooling exception: react plugin's declared peers do not yet include ESLint10. npm marks ESLint9 unsupported; do not mislabel this as latest or permanently safe |
| Tailwind | 4.3.3 | Existing CSS architecture retained |
| Puppeteer / Chrome for Testing | 25.11.0 / 153.0.8010.36 | Matching supported pair; Linux browser pinned at build time |
| Vitest | 5.0.1 | Node24 unit and PostgreSQL integration regressions |
| GitHub Actions | checkout 7.0.1 / setup-node 7.0.0 | Official releases verified through GitHub API, pinned commit SHAs, Node24 action runtime and read-only workflow token |
| Zod / Pino | 4.6.5 / 10.3.1 | Bounded input/env validation; structured redacted logs |

Removed mandatory Supabase clients, Vercel Chromium helper/config and unsafe Polar SDK consumers. Existing Polar data columns remain for later entitlement migration. Resend is retained only as an explicitly disabled-by-default transition adapter.

Compatible transitive updates removed the previous high-severity advisories. A narrowly scoped override uses `esbuild 0.25.12` beneath `@esbuild-kit/core-utils`, replacing the obsolete development-server dependency inherited from Drizzle kit. It changes no production dependency or global esbuild resolution. The code-generation path must remain covered when kit is upgraded; remove this override once upstream retires the old loader.

Full `npm audit` reported **0 vulnerabilities** after these changes. This is a point-in-time package advisory result, not proof of application security. CI repeats the audit and all quality checks.

Sources: [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Next custom server tracing limitations](https://nextjs.org/docs/app/guides/custom-server), [TypeScript ESLint supported versions](https://typescript-eslint.io/users/dependency-versions/), [Puppeteer browser pairing](https://pptr.dev/supported-browsers), [Drizzle's legacy loader issue](https://github.com/drizzle-team/drizzle-orm/issues/5304).
