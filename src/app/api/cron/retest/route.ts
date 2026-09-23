import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api";

// Recurring generation belongs exclusively to the scheduler/BullMQ runtime.
// Keep a tombstone for old cron callers without loading DB/provider services.
export const GET = withApi(async () => NextResponse.json(
  { status: "retired", message: "HTTP cron retesting has been retired. Scheduled work runs through BullMQ." },
  { status: 410, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
));
