import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api";
import { getCatalog } from "@/modules/catalog/service";
export const GET = withApi(async () => NextResponse.json(await getCatalog(), { headers: { "Cache-Control": "public, max-age=300" } }));
