import {
  welcomeEmail,
  proUpgradeEmail,
  adSlotConfirmationEmail,
  speedTrendAlertEmail,
  weeklyRecapEmail,
  monitoringPauseEmail,
  listingRemovalEmail,
  badgeWarningEmail,
  badgeDeletionEmail,
} from "@/lib/email/templates";
import { notFound } from "next/navigation";
import { escapeXml } from "@/lib/seo/xml";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteConfig } from "@/config/site";

export const metadata = pageMetadata({ title: "Email preview", description: "Internal email template preview.", path: "/email-preview", index: false, follow: false });

export default function EmailPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[]; name?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  return <EmailPreview searchParams={searchParams} />;
}

async function EmailPreview({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[]; name?: string | string[] }>;
}) {
  const { template, name: requestedName } = await searchParams;
  const name = escapeXml(typeof requestedName === "string" ? requestedName.slice(0, 100) : siteConfig.ownerName);

  const emails: Record<string, { subject: string; html: string }> = {
    welcome: welcomeEmail(name),
    "pro-upgrade": proUpgradeEmail(name),
    "ad-slot": adSlotConfirmationEmail(name, "BuiltByMe", "A home for those who build on their own"),
    "speed-trend": speedTrendAlertEmail(name, "Example website", "example-website", [
      { date: "Feb 10", score: 92 },
      { date: "Feb 11", score: 85 },
      { date: "Feb 12", score: 78 },
    ], { fcp: "1.2s", lcp: "2.8s", cls: "0.05", tbt: "320ms", si: "3.1s" }),
    "monitoring-pause": monitoringPauseEmail(name, [
      { name: "Example website", slug: "example-website", score: 94 },
      { name: "SubmitWell", slug: "submitwell", score: 81 },
    ]),
    "listing-removal": listingRemovalEmail(name, [
      { name: "Example website", slug: "example-website", score: 94 },
    ]),
    "badge-deletion": badgeDeletionEmail(
      name,
      "Refer to Earn",
      "https://www.refertoearn.co.uk"
    ),
    "badge-warning": badgeWarningEmail(
      name,
      "Refer to Earn",
      "https://www.refertoearn.co.uk",
      "refer-to-earn"
    ),
    "weekly-recap": weeklyRecapEmail(
      name,
      [
        { name: "Example website", slug: "example-website", score: 97, previousScore: 92, rank: 1 },
        { name: "SubmitWell", slug: "submitwell", score: 84, previousScore: 86, rank: 4 },
      ],
      [
        { name: "BuiltByMe", tagline: "A home for those who build on their own", url: "https://builtby.me" },
        { name: "ShipFast", tagline: "Launch your SaaS in days", url: "https://shipfast.com" },
        { name: "Indie Hackers", tagline: "Community for bootstrapped founders", url: "https://indiehackers.com" },
      ]
    ),
  };

  const selectedTemplate = typeof template === "string" && Object.hasOwn(emails, template) ? template : "welcome";
  const email = emails[selectedTemplate];

  return (
    <div className="py-8 px-5">
      <div className="max-w-[560px] mx-auto mb-6">
        <h1 className="font-display font-[800] text-[1.3rem] mb-4">
          Email Preview
        </h1>
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.keys(emails).map((key) => (
            <a
              key={key}
              href={`/email-preview?template=${key}`}
              className={`px-3.5 py-2 rounded-lg text-[0.82rem] font-semibold no-underline transition-all ${
                key === selectedTemplate
                  ? "bg-accent text-bg-deep"
                  : "bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover"
              }`}
            >
              {key}
            </a>
          ))}
        </div>
        <div className="bg-bg-card border border-border rounded-lg px-3.5 py-2 mb-4 text-[0.8rem]">
          <span className="text-text-muted">Subject:</span>{" "}
          <span className="text-text-primary font-semibold">
            {email.subject}
          </span>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto border border-border rounded-[14px] overflow-hidden">
        <iframe
          srcDoc={email.html}
          className="w-full border-none"
          style={{ height: "750px" }}
          title="Email Preview"
          sandbox=""
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
