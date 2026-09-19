import { NextResponse } from "next/server";
import { withApi } from "@/lib/http/api";
import { readWebhookBody, verifyPaymentWebhook } from "@/infrastructure/payments/webhook";
import { receivePaymentEvent } from "@/modules/payments/service";

export const POST = withApi(async (request) => {
  const event = verifyPaymentWebhook(await readWebhookBody(request), request.headers);
  if (event) await receivePaymentEvent(event);
  return NextResponse.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
});
