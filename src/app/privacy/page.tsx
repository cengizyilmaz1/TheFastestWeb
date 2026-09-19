import type { Metadata } from "next";
import { EditorialPage, type EditorialSection } from "@/components/layout/EditorialPage";
import { siteConfig } from "@/config/site";
export const metadata: Metadata = { title: "Privacy information", alternates: { canonical: "/privacy" } };

const sections: EditorialSection[] = [
  { id: "preview", title: "During the preview", body: <p>The demo has payment processing, email delivery, analytics and scheduled monitoring disabled. Existing public website reports may be displayed. Registration becomes available when the authentication provider is configured.</p> },
  { id: "accounts", title: "Accounts and public profiles", body: <p>When Google sign-in is enabled, we use your verified email address, name and profile image to maintain your account. Your email is not part of the public website directory. Founder profiles are private by default and become public only when you choose that visibility. Information you add to a public profile, such as its biography and social links, is visible to visitors.</p> },
  { id: "measurements", title: "Website measurements and screenshots", body: <><p>Submitted URLs, website descriptions, performance results, ownership checks and related history are stored to operate the directory. URLs sent for a performance test are processed by Google PageSpeed Insights. Do not submit URLs containing access tokens or private information.</p><p>Public website screenshots can be published with a listing. Private review captures remain separate from public media. Performance and competition history is retained to explain previous results; removing a public profile does not automatically rewrite completed competition archives.</p></> },
  { id: "payments", title: "Payments and messages", body: <p>When enabled, Dodo handles checkout. TheFastestWeb stores order and payment status needed to grant access, but does not collect card details. Microsoft Graph handles enabled account and product emails. Notification preferences let you choose optional categories; account and transaction messages are handled separately.</p> },
  { id: "cookies", title: "Cookies and analytics", body: <p>Authentication uses cookies to maintain a session. The theme setting is stored in your browser. Google Analytics and DataFast, when enabled, load only after analytics consent. You can decline or change that choice. Global Privacy Control and Do Not Track signals are treated as a refusal. Private account routes are excluded from analytics.</p> },
  { id: "requests", title: "Service operation and requests", body: <><p>Operational records include event identifiers, job status and safe error codes used to investigate failures. Credentials and raw provider errors are excluded from application logs. Access to account administration is restricted to assigned operators.</p><p>{siteConfig.email ? <>For account or privacy requests, contact <a href={"mailto:" + siteConfig.email}>{siteConfig.email}</a>.</> : "The account and privacy support address will be published before public registration opens."}</p></> },
];

export default function Page() {
  return <EditorialPage eyebrow="Privacy information" title="Your account. Your choices." intro="This page describes the information used by TheFastestWeb and the controls available in the product." sections={sections} />;
}
