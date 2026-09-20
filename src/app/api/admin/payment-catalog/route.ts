import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api";
import { requireAdmin } from "@/modules/admin/access";
import { executePaymentCatalog, getPaymentCatalog, paymentCatalogRequestSchema, previewPaymentCatalog } from "@/modules/admin/payment-catalog";
import { readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";

export const GET = withApi(async () => {
  const actor = await requireAdmin();
  return NextResponse.json(await getPaymentCatalog(actor), { headers: { "Cache-Control": "no-store" } });
});
export const POST = withApi(async (request) => {
  const actor = await requireAdmin(request);
  await enforceRateLimit("admin-payment-catalog", actor.userId, 20, 60);
  const { operation, token, ...action } = await readJson(request, paymentCatalogRequestSchema, 4096);
  const result = operation === "preview" ? await previewPaymentCatalog(actor, action) : await executePaymentCatalog(actor, action, token ?? "");
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
});
