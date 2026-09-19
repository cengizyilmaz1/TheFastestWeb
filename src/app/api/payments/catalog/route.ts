import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api";
import { listProducts } from "@/modules/payments/service";
import { listAvailableAdInventory } from "@/modules/payments/ads";
import { isPaymentsEnabled } from "@/infrastructure/payments/dodo";

export const dynamic = "force-dynamic";
export const GET = withApi(async () => NextResponse.json({ products: await listProducts(), adInventory: isPaymentsEnabled() ? await listAvailableAdInventory() : [] }, { headers: { "Cache-Control": "no-store" } }));
