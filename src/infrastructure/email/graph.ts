import { z } from "zod";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";

export type MailMessage = { to: string; subject: string; html: string };
export interface MailProvider { send(message: MailMessage): Promise<{ status: "accepted" }> }
export class MailDeliveryError extends AppError {
  constructor(readonly deliveryCode: "TOKEN_UNAVAILABLE" | "RATE_LIMITED" | "REJECTED" | "UNCERTAIN",
    readonly retryable: boolean, readonly retryAfterMs?: number) {
    super("UPSTREAM_UNAVAILABLE", "The email provider could not confirm this request.", 503);
  }
}
export const isEmailEnabled = () => getEnv().EMAIL_ENABLED;
let cachedToken: { value: string; expiresAt: number } | undefined;
let pendingToken: Promise<string> | undefined;

async function requestToken(): Promise<string> {
  const env = getEnv();
  if (!env.EMAIL_ENABLED || !env.M365_TENANT_ID || !env.M365_CLIENT_ID || !env.M365_CLIENT_SECRET || !env.M365_SENDER) {
    throw new AppError("FEATURE_DISABLED", "Email delivery is not enabled.", 503);
  }
  try {
    const response = await fetch(`https://login.microsoftonline.com/${env.M365_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.M365_CLIENT_ID, client_secret: env.M365_CLIENT_SECRET,
        grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new MailDeliveryError("TOKEN_UNAVAILABLE", response.status === 429 || response.status >= 500); }
    const result = z.object({ access_token: z.string().min(1).max(32_768), expires_in: z.number().int().min(61).max(172_800) }).safeParse(await response.json());
    if (!result.success) throw new MailDeliveryError("TOKEN_UNAVAILABLE", true);
    cachedToken = { value: result.data.access_token, expiresAt: Date.now() + (result.data.expires_in - 60) * 1000 };
    return cachedToken.value;
  } catch (error) {
    if (error instanceof MailDeliveryError || error instanceof AppError) throw error;
    throw new MailDeliveryError("TOKEN_UNAVAILABLE", true);
  }
}

async function token() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  pendingToken ??= requestToken().finally(() => { pendingToken = undefined; });
  return pendingToken;
}

export const graphMail: MailProvider = {
  async send(message) {
    if (!isEmailEnabled()) throw new AppError("FEATURE_DISABLED", "Email delivery is not enabled.", 503);
    if (!z.email().safeParse(message.to).success || /[\r\n]/.test(message.subject)
      || message.subject.length > 200 || Buffer.byteLength(message.html) > 100_000) {
      throw new MailDeliveryError("REJECTED", false);
    }
    const accessToken = await token(); // Failures here are known to precede sendMail.
    let response: Response;
    try {
      response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(getEnv().M365_SENDER!)}/sendMail`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { subject: message.subject,
          body: { contentType: "HTML", content: message.html }, toRecipients: [{ emailAddress: { address: message.to } }] },
          saveToSentItems: true }),
      });
    } catch { throw new MailDeliveryError("UNCERTAIN", false); }
    await response.body?.cancel();
    if (response.status === 202) return { status: "accepted" };
    if (response.status === 401) { cachedToken = undefined; throw new MailDeliveryError("REJECTED", true); }
    if (response.status === 429) {
      const header = response.headers.get("retry-after") ?? "";
      const duration = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
      throw new MailDeliveryError("RATE_LIMITED", true, Number.isFinite(duration) ? Math.min(86_400_000, Math.max(0, duration)) : undefined);
    }
    if (response.status >= 400 && response.status < 500 && response.status !== 408) throw new MailDeliveryError("REJECTED", false);
    // A timeout or server error after submission cannot prove the mail was unsent.
    throw new MailDeliveryError("UNCERTAIN", false);
  },
};
