# Loading and interaction performance

The homepage starts leaderboard rows and aggregate statistics together. Aggregate queries and layout account/advertisement reads also run concurrently. The hero and initial leaderboard render together so a late table cannot move the footer through the viewport. Database failures are handled outside the five-minute public data cache; failed reads cannot cache a zero count. An unavailable leaderboard offers a retry.

React request memoization shares account and tier reads between a layout, page and metadata in one server render. It does not cache account data between requests. Public privacy-sensitive profile and screenshot checks still read their current visibility.

Local 28px founder avatars and the 32px logo use Next Image, explicit dimensions and fixed `sizes`. External customer icons retain the existing browser fallback policy; arbitrary remote image optimization is not enabled. Original public files stay available at their existing URLs.

Advertisement checkout JavaScript loads when its trigger is opened. Performance chart code loads only when a chart with at least two points approaches the viewport. The chart container reserves its height; score, trend and date-range controls remain available while it loads. Chart drawing animation is disabled, and range buttons expose their selected state.

Homepage sorting and pagination use the same server order. A sort change replaces the first page; subsequent requests retain that sort. Superseded requests are cancelled, late responses ignored and overlapping records deduplicated. Millisecond and second values, including their formatted spaces, use the same ordering on the server and in complete local tier lists.

## Verification

`scripts/public-runtime-smoke.ts` uses disposable loopback PostgreSQL/Redis fixtures and a production build. It includes `scripts/verify-performance.mjs`: optimized images must load, lazy advertisement checkout must open and restore keyboard focus, and the below-fold chart must appear on scroll and keep its controls functional. It also runs the existing bounded load, accessibility and browser checks. These are implementation and regression checks, not claims about real-user Core Web Vitals.

For controlled Lighthouse evidence, run the runtime harness with `SMOKE_LIGHTHOUSE=true`. Reports record device configuration, simulated throttling, LCP, CLS and blocking time. Compare repeated runs under equivalent conditions; do not treat a single live navigation or changing third-party badge latency as a guaranteed speed increase.
