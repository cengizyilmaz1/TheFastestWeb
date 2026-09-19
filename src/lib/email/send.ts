import { Resend } from "resend";

const FROM_EMAIL = "TheFastestWeb <noreply@thefastestweb.site>";

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  console.log(`[email] Attempting to send "${subject}" to ${to}`);
  console.log(`[email] RESEND_API_KEY present: ${!!apiKey}, length: ${apiKey?.length || 0}`);

  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not set!");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("[email] Resend API error:", JSON.stringify(error));
      return { success: false, error: error.message };
    }

    console.log(`[email] Sent successfully, id: ${data?.id}`);
    return { success: true };
  } catch (err) {
    console.error("[email] Exception:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
