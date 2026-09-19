import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api";
import { listProducts } from "@/modules/payments/service";

export const dynamic = "force-dynamic";
export const GET = withApi(async () => NextResponse.json({ products: await listProducts() }, { headers: { "Cache-Control": "no-store" } }));
