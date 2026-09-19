import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
const base = new URL(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3200");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("Load smoke is restricted to a loopback test instance.");
const paths = ["/", "/explore", "/leaderboard", "/methodology"];
const durations = [], failures = [];
let next = 0;
const began = performance.now();
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < 80) {
    const index = next++, start = performance.now(), path = paths[index % paths.length];
    try {
      const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) });
      await response.arrayBuffer();
      if (!response.ok) failures.push({ path, status: response.status });
    } catch { failures.push({ path, status: "timeout_or_network" }); }
    durations.push(performance.now() - start);
  }
}));
durations.sort((a, b) => a - b);
const report = { environment: "isolated loopback production build; synthetic database", requests: durations.length, concurrency: 4,
  durationMs: Math.round(performance.now() - began), p50Ms: Math.round(durations[Math.ceil(durations.length * .5) - 1]),
  p95Ms: Math.round(durations[Math.ceil(durations.length * .95) - 1]), failures };
await mkdir("test-results", { recursive: true });
await writeFile("test-results/load-smoke.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (failures.length) process.exitCode = 1;
