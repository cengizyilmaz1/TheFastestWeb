import { AppError } from "@/lib/http/errors";

/** Existing Pro flags, payments and ad ownership remain in the database.
 * Checkout/webhook mutation is paused until M3 introduces a verified, idempotent
 * ledger and entitlement migration. Never acknowledge unprocessed events as 2xx.
 */
export function unavailableBilling(): never {
  throw new AppError("FEATURE_DISABLED", "New purchases are temporarily unavailable while billing is upgraded. Existing access is preserved.", 503);
}
