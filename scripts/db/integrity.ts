import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import { isAbsolute,relative,resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/** Aggregate integrity manifest only: never exports individual rows or connection credentials. */
async function main() {
  const [mode,argument]=process.argv.slice(2);
  if(!["capture","verify"].includes(mode) || !argument || process.argv.length!==4)
    throw new Error("Usage: tsx scripts/db/integrity.ts capture|verify <private-manifest.json>");
  const databaseUrl=process.env.MIGRATION_DATABASE_URL;
  if(!databaseUrl) throw new Error("Set MIGRATION_DATABASE_URL privately for the database being checked");
  const target=resolve(argument),repository=fileURLToPath(new URL("../../",import.meta.url));
  const path=relative(repository,target);
  if(!isAbsolute(path) && path!==".." && !path.startsWith("../") && !path.startsWith("..\\"))
    throw new Error("Integrity manifests must stay outside the Git repository");
  const client=postgres(databaseUrl,{max:1,connect_timeout:10,onnotice:()=>undefined,
    connection:{application_name:"tfw-integrity-audit",statement_timeout:120_000,lock_timeout:5000}});
  try {
    const manifest=await client.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY",async(tx)=>{
      await tx`SET LOCAL TIME ZONE 'UTC'`;
      const tables=await tx<{name:string;schema:string}[]>`SELECT tablename AS name,schemaname AS schema FROM pg_tables WHERE schemaname IN ('public','app_meta') ORDER BY schemaname,tablename`;
      const entries=[];
      for(const table of tables){
        const schema=table.schema;
        const [result]=await tx`SELECT count(*)::text AS rows,
          encode(sha256(convert_to(coalesce(string_agg(hash,'' ORDER BY hash),''),'UTF8')),'hex') AS sha256
          FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS hash FROM ${tx(`${schema}.${table.name}`)} t) hashed`;
        entries.push({table:`${schema}.${table.name}`,rows:result.rows,sha256:result.sha256});
      }
      const names=await tx<{name:string}[]>`SELECT sequencename AS name FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
      const sequences=[];
      for(const sequence of names){const [state]=await tx`SELECT last_value::text,is_called FROM ${tx(`public.${sequence.name}`)}`;sequences.push({sequence:sequence.name,...state});}
      return {format:"tfw-integrity-v1",tables:entries,sequences};
    });
    if(mode==="capture") await writeFile(target,JSON.stringify(manifest,null,2)+"\n",{flag:"wx",mode:0o600});
    else assert.deepEqual(manifest,JSON.parse(await readFile(target,"utf8")),"Restore integrity differs; investigate before switching traffic");
    console.log(`${mode==="capture" ? "Captured" : "Verified"} aggregate integrity for ${manifest.tables.length} tables and ${manifest.sequences.length} sequences; no individual rows exported.`);
  } finally {await client.end({timeout:5});}
}
main().catch(()=>{console.error("Integrity operation failed. Check the private target, database state and manifest; no database changes were made.");process.exitCode=1;});
