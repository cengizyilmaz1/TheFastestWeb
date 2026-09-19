import { NextResponse } from "next/server";
import { isShuttingDown } from "@/config/lifecycle";
import { checkReadiness } from "@/infrastructure/health/readiness";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  if (isShuttingDown()) throw new AppError("SERVICE_UNAVAILABLE", "Service is stopping.", 503);
  await checkReadiness();
  return NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
});
