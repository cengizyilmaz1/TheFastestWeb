import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/http/api";
import { readJson } from "@/modules/security/request";
import { unsubscribe } from "@/modules/notifications/service";

// Signed capability authorizes only disabling one optional category. GET never
// mutates preferences, so email scanners cannot unsubscribe the recipient.
export const POST = withApi(async (request) => {
  const { token } = await readJson(request, z.object({ token: z.string().min(1).max(1024) }).strict(), 2048);
  await unsubscribe(token);
  return NextResponse.json({ unsubscribed: true }, { headers: { "Cache-Control": "no-store" } });
});
