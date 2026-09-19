import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function main(): Promise<void> {
  const [sourceArgument, outputArgument] = process.argv.slice(2);
  if (!sourceArgument || !outputArgument || process.argv.length !== 4) {
    throw new Error("Usage: tsx scripts/db/prepare-dump.ts <private-source.sql> <private-output.sql>");
  }
  const source = resolve(sourceArgument);
  const output = resolve(outputArgument);
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  const withinRepository = relative(repository, output);
  if (!isAbsolute(withinRepository) && withinRepository !== ".." && !withinRepository.startsWith("../") && !withinRepository.startsWith("..\\")) {
    throw new Error("Prepared dump contains private data and must be written outside this Git repository");
  }
  if (source.toLowerCase() === output.toLowerCase()) throw new Error("Original dump must never be overwritten");
  const bytes = await readFile(source);
  const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  const knownSnapshot = "79474792d88c1391e71f42b1a4a8628b74870b6460b1a9e2353b65bb1b1202ba";
  if (sha256(bytes) !== knownSnapshot) {
    throw new Error("Source differs from the reviewed September 19 snapshot. Review the new export before preparing it.");
  }
  const dump = bytes.toString("utf8");
  const statement = /^CREATE SCHEMA public;$/gm;
  if ([...dump.matchAll(statement)].length !== 1) throw new Error("Expected one public schema creation statement");
  const prepared = dump.replace(statement, "CREATE SCHEMA IF NOT EXISTS public;");
  await writeFile(output, prepared, { flag: "wx", mode: 0o600 });
  console.log(`Prepared a private import copy. Original SHA-256: ${sha256(bytes)}. Prepared SHA-256: ${sha256(prepared)}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Dump preparation failed");
  process.exitCode = 1;
});
