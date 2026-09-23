import { z } from "zod";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";
import { logger } from "@/infrastructure/logging/logger";

const graphErrorCodes = [
  "ErrorAccessDenied", "Authorization_RequestDenied", "ErrorSendAsDenied", "insufficient_claims",
  "InvalidAuthenticationToken", "ErrorInvalidUser", "Request_ResourceNotFound", "ResourceNotFound",
  "ErrorItemNotFound", "MailboxNotEnabledForRESTAPI", "ErrorInvalidRecipients", "ErrorRecipientNotFound",
  "ErrorInvalidRequest", "BadRequest", "ErrorQuotaExceeded", "TooManyRequests", "ErrorThrottled",
  "ErrorServerBusy", "ServiceUnavailable", "ErrorInternalServerError",
] as const;
type GraphErrorCode = typeof graphErrorCodes[number] | "UNRECOGNIZED_ERROR" | "ERROR_DETAILS_UNAVAILABLE";
type GraphDiagnostic = { httpStatus: number; providerCode: GraphErrorCode };
const knownGraphCodes = new Map(graphErrorCodes.map(code => [code.toLowerCase(), code]));
const MAX_ERROR_BYTES = 16_384;
const ERROR_READ_TIMEOUT_MS = 1000;

/** Only allowlisted machine codes leave this boundary; messages may contain PII. */
async function graphErrorCode(response: Response): Promise<GraphErrorCode> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    reader = response.body?.getReader();
    if (!reader) return "ERROR_DETAILS_UNAVAILABLE";
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Diagnostic read timed out")), ERROR_READ_TIMEOUT_MS);
    });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_ERROR_BYTES) return "ERROR_DETAILS_UNAVAILABLE";
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    let current: unknown = body && typeof body === "object" ? (body as Record<string, unknown>).error : undefined;
    let code: GraphErrorCode = "UNRECOGNIZED_ERROR";
    // Graph recommends the deepest error code understood by the caller. Bound
    // traversal and canonicalize via our map, never echo provider-supplied text.
    for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
      const detail = current as Record<string, unknown>;
      const recognized = typeof detail.code === "string" ? knownGraphCodes.get(detail.code.toLowerCase()) : undefined;
      if (recognized) code = recognized;
      current = detail.innerError ?? detail.innererror;
    }
    return code;
  } catch { return "ERROR_DETAILS_UNAVAILABLE"; }
  finally {
    clearTimeout(timer);
    // Diagnostics must never delay or change the original delivery decision.
    void reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}

export type MailMessage = { to: string; subject: string; html: string };
export interface MailProvider { send(message: MailMessage): Promise<{ status: "accepted" }> }
export class MailDeliveryError extends AppError {
  readonly httpStatus?: number;
  readonly providerCode?: GraphErrorCode;
  constructor(readonly deliveryCode: "TOKEN_UNAVAILABLE" | "RATE_LIMITED" | "REJECTED" | "UNCERTAIN",
    readonly retryable: boolean, readonly retryAfterMs?: number, diagnostic?: GraphDiagnostic) {
    super("UPSTREAM_UNAVAILABLE", "The email provider could not confirm this request.", 503);
    this.httpStatus = diagnostic?.httpStatus;
    this.providerCode = diagnostic?.providerCode;
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
    if (response.status === 202) { await response.body?.cancel(); return { status: "accepted" }; }
    const diagnostic: GraphDiagnostic = { httpStatus: response.status, providerCode: await graphErrorCode(response) };
    const failure = (deliveryCode: MailDeliveryError["deliveryCode"], retryable: boolean, retryAfterMs?: number) => {
      logger.warn({ event: "mail.graph_send_failed", ...diagnostic, deliveryCode, retryable });
      return new MailDeliveryError(deliveryCode, retryable, retryAfterMs, diagnostic);
    };
    if (response.status === 401) { cachedToken = undefined; throw failure("REJECTED", true); }
    if (response.status === 429) {
      const header = response.headers.get("retry-after") ?? "";
      const duration = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
      throw failure("RATE_LIMITED", true, Number.isFinite(duration) ? Math.min(86_400_000, Math.max(0, duration)) : undefined);
    }
    if (response.status >= 400 && response.status < 500 && response.status !== 408) throw failure("REJECTED", false);
    // A timeout or server error after submission cannot prove the mail was unsent.
    throw failure("UNCERTAIN", false);
  },
};
