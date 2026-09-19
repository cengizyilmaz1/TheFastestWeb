import { parseArgs } from "node:util";
import { closeDb } from "@/db";
import { bootstrapAdministrator } from "@/modules/admin/service";
import { AppError } from "@/lib/http/errors";

async function main() {
  const { values } = parseArgs({ options: { user: { type: "string" }, reason: { type: "string" }, "confirm-user": { type: "string" } }, strict: true });
  if (!values.user || values["confirm-user"] !== values.user || !values.reason) {
    throw new AppError("INVALID_REQUEST", "Usage: admin-bootstrap --user UUID --confirm-user SAME_UUID --reason 'Operator reason (8+ characters)'", 400);
  }
  process.stdout.write(JSON.stringify(await bootstrapAdministrator(values.user, values.reason)) + "\n");
}
main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({ errorCode: error instanceof AppError ? error.code : "BOOTSTRAP_FAILED",
    message: error instanceof AppError ? error.message : "Administrator bootstrap failed. Check the account and database configuration." }) + "\n");
  process.exitCode = 1;
}).finally(closeDb);
