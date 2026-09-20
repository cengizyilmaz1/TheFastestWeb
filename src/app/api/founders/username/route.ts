import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api";
import { requireUser } from "@/lib/auth";
import { readJson } from "@/modules/security/request";
import { enforceRateLimit } from "@/modules/security/rate-limit";
import { changeOwnUsername, usernameChangeSchema } from "@/modules/founders/usernames";
export const PATCH = withApi(async request => {
  const user = await requireUser(request);
  await enforceRateLimit("founder-username", user.id, 10, 3600);
  const result = await changeOwnUsername(user.id, await readJson(request, usernameChangeSchema, 1024));
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
});

