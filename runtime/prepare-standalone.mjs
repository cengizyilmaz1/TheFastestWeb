import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { serverConfig } from "./next-options.mjs";

const project = resolve(import.meta.dirname, "..");
const standalone = resolve(project, ".next/standalone");
// Explicitly copy this tiny custom server; Next only traces its own server.js.
await mkdir(resolve(standalone, "runtime"), { recursive: true });
for (const file of ["server.mjs", "shutdown.mjs", "browser-smoke.mjs", "legacy-redirects.mjs"]) {
  await copyFile(resolve(project, "runtime", file), resolve(standalone, "runtime", file));
}
await writeFile(resolve(standalone, "next.config.js"), `module.exports = ${JSON.stringify(serverConfig, null, 2)};\n`);
// Reuse the exact typed validator before opening a port. Next's custom server
// prepare() may resolve before its asynchronous instrumentation has completed.
const envSource = await readFile(resolve(project, "src/config/env.ts"), "utf8");
const compiledEnv = ts.transpileModule(envSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
await writeFile(resolve(standalone, "runtime/env.mjs"), compiledEnv);
// Normal config loading installs Next's webpack aliases; standalone's own
// server bypasses that loader, so its default trace omits these small modules.
for (const packagePath of ["next/dist/compiled/webpack", "next/dist/compiled/@babel/runtime", "zod"]) {
  await cp(
    resolve(project, "node_modules", packagePath),
    resolve(standalone, "node_modules", packagePath),
    { recursive: true },
  );
}
