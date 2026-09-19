import { NextResponse } from "next/server";
import { isShuttingDown } from "@/config/lifecycle";
import { withApi } from "@/lib/http/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => NextResponse.json(
  { status: isShuttingDown() ? "stopping" : "ok" },
  { status: isShuttingDown() ? 503 : 200, headers: { "Cache-Control": "no-store" } },
));
