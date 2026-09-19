import { Resend } from "resend";
import { getEnv } from "@/config/env";
import { logger } from "@/infrastructure/logging/logger";

export async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  const env = getEnv();
  if (!env.ENABLE_LEGACY_RESEND || !env.RESEND_API_KEY) return { success: false, error: "EMAIL_DISABLED" };
  try {
    const { error } = await new Resend(env.RESEND_API_KEY).emails.send({
      from: "TheFastestWeb <noreply@thefastestweb.site>", to, subject, html,
    });
    if (error) {
      logger.error({ event: "email.failed", code: "UPSTREAM_UNAVAILABLE" });
      return { success: false, error: "EMAIL_PROVIDER_UNAVAILABLE" };
    }
    return { success: true };
  } catch {
    logger.error({ event: "email.failed", code: "UPSTREAM_UNAVAILABLE" });
    return { success: false, error: "EMAIL_PROVIDER_UNAVAILABLE" };
  }
}
