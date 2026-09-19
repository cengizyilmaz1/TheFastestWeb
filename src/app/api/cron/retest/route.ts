import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import { isCronAuthorized } from "@/modules/security/request";
import { withApi } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { scheduleDailyRetests, scheduleMaintenance } from "@/modules/jobs/service";

// Compatibility trigger only. The scheduler dispatches durable jobs to workers.
export const GET = withApi(async (request) => {
  if (!isCronAuthorized(request.headers.get("authorization"), getEnv().CRON_SECRET)) throw new AppError("UNAUTHORIZED", "Unauthorized.", 401);
  const performance = await scheduleDailyRetests();
  const maintenance = await scheduleMaintenance();
  return NextResponse.json({ status: "accepted", scheduled: performance.scheduled, maintenance: maintenance.scheduled },
    { status: 202, headers: { "Cache-Control": "no-store" } });
});
