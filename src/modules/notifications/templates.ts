import { z } from "zod";
import { getEnv } from "@/config/env";

export const notificationTemplates = {
  welcome: { subject: "Welcome to TheFastestWeb", category: "transactional", text: "Your account is ready. Add a website to track its performance." },
  site_approved: { subject: "Your website is approved", category: "transactional", text: "Your website has been approved for the public directory." },
  weekly_result: { subject: "Your weekly performance results", category: "weekly", text: "Your latest weekly performance results are ready." },
  weekly_winner: { subject: "Your website earned a weekly award", category: "weekly", text: "Your website placed among this week's verified winners." },
  ranking_changed: { subject: "Your website ranking changed", category: "weekly", text: "A new ranking snapshot is available for your website." },
  performance_dropped: { subject: "Your website performance dropped", category: "performance", text: "A recent measurement detected a performance decrease. Review the evidence on your website report." },
  performance_improved: { subject: "Your website performance improved", category: "performance", text: "A recent measurement detected a performance improvement." },
  badge_awarded: { subject: "Your website earned a badge", category: "badge", text: "A new verified achievement is available for your website." },
  badge_warning: { subject: "Check your website badge", category: "badge", text: "Your badge needs attention. Review its current eligibility on your website report." },
  claim_verification: { subject: "Verify your website claim", category: "transactional", text: "Complete the ownership verification steps to manage this website." },
  payment_success: { subject: "Your payment was confirmed", category: "transactional", text: "Your payment was confirmed. Review your purchase and access in your account." },
  payment_failed: { subject: "Your payment needs attention", category: "transactional", text: "Your payment could not be completed. No new access was granted for this attempt." },
  subscription_event: { subject: "Your subscription changed", category: "transactional", text: "Your subscription status has changed. Review its current status in your account." },
  ad_approved: { subject: "Your advertisement was approved", category: "transactional", text: "Your advertisement was approved. Its placement and dates are available on your website report." },
  inactivity_warning: { subject: "Review your website monitoring", category: "marketing", text: "You have not visited recently. Review your website and monitoring preferences when convenient." },
} as const;
export type NotificationTemplate = keyof typeof notificationTemplates;
export type PreferenceCategory = "performance" | "weekly" | "badge" | "marketing";
export const templateSchema = z.enum(Object.keys(notificationTemplates) as [NotificationTemplate, ...NotificationTemplate[]]);
export const variablesSchema = z.object({
  name: z.string().max(120).optional(), siteName: z.string().max(200).optional(),
  score: z.number().min(0).max(100).optional(), previousScore: z.number().min(0).max(100).optional(),
  rank: z.number().int().positive().max(1_000_000).optional(), period: z.string().max(100).optional(),
  actionPath: z.string().max(500).regex(/^\/(?!\/)[a-zA-Z0-9/_?=&%.-]*$/).optional(),
}).strict();
export type NotificationVariables = z.infer<typeof variablesSchema>;
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function renderNotification(template: NotificationTemplate, input: NotificationVariables, unsubscribeUrl?: string) {
  const variables = variablesSchema.parse(input);
  const definition = notificationTemplates[template];
  const details = [variables.siteName && `Website: ${variables.siteName}`, variables.period && `Period: ${variables.period}`,
    variables.score !== undefined && `Score: ${variables.score}/100`, variables.previousScore !== undefined && `Previous score: ${variables.previousScore}/100`,
    variables.rank !== undefined && `Rank: ${variables.rank}`].filter((item): item is string => typeof item === "string");
  const requestedPath = variables.actionPath ?? "/submit";
  // Queued notifications can predate the return to the original page set.
  const actionPath = /^\/(?:dashboard|admin|claim|weekly|monthly|founders|compare|hall-of-fame)(?:[/?]|$)/.test(requestedPath) ? "/submit" : requestedPath;
  const url = new URL(actionPath, getEnv().SITE_URL);
  if (url.origin !== new URL(getEnv().SITE_URL).origin) throw new Error("Invalid notification destination");
  return { subject: definition.subject, html: `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#202824;max-width:640px;margin:32px auto;padding:24px"><h1 style="font-size:24px">${escapeHtml(definition.subject)}</h1><p>Hello${variables.name ? ` ${escapeHtml(variables.name)}` : ""},</p><p>${escapeHtml(definition.text)}</p>${details.map((detail) => `<p>${escapeHtml(detail)}</p>`).join("")}<p><a href="${escapeHtml(url.toString())}">Open TheFastestWeb</a></p><hr><p style="font-size:12px">TheFastestWeb${unsubscribeUrl ? ` · <a href="${escapeHtml(unsubscribeUrl)}">Manage or unsubscribe from these emails</a>` : " · Account and transaction notification"}</p></body></html>` };
}
