import { build } from "esbuild";

await build({
  entryPoints: ["src/bin/worker.ts", "src/bin/scheduler.ts", "src/bin/queue-admin.ts", "src/bin/admin-bootstrap.ts"],
  outdir: "dist/jobs", outExtension: { ".js": ".cjs" }, platform: "node", target: "node24",
  format: "cjs", bundle: true, packages: "external", sourcemap: false,
  logLevel: "info",
});
