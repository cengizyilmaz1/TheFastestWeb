import type { Metadata } from "next";
import Link from "next/link";
import { EditorialPage } from "@/components/layout/EditorialPage";
import { siteConfig } from "@/config/site";
export const metadata: Metadata = { title: "Terms of use", alternates: { canonical: "/terms" } };
export default function Page() {
  return <EditorialPage eyebrow="Terms of use" title="A fair place to build." intro="These terms describe how to use TheFastestWeb’s directory, website measurements and community features.">
    <section><h2>Using the service</h2><p>Use the service for public websites you are permitted to submit or test. Do not use it to access private networks, bypass access controls, send malicious content, manipulate measurements or misrepresent ownership. Keep your account access secure.</p></section>
    <section><h2>Your submissions</h2><p>You are responsible for website descriptions, images, profile details and links you provide. You allow us to display submitted public content and related measurements as part of the directory. Only claim websites you control. A successful domain check does not automatically override an existing owner’s account.</p></section>
    <section><h2>Measurements and competitions</h2><p>Performance results describe recorded lab tests, not a guarantee of availability, security or real-user performance. Results can vary. Eligibility, calculation and tie-break rules are described in the <Link href="/methodology">measurement methodology</Link>. Completed competition records preserve their evidence and are not recalculated when a website later changes.</p></section>
    <section><h2>Plans and sponsorship</h2><p>Available products, prices, renewal intervals and applicable checkout terms are shown before purchase. Payments use Dodo when enabled. A redirect from checkout alone does not grant a plan; access follows confirmed payment status. Sponsored placements are labelled and do not improve organic performance rankings.</p><p>Payment processing is disabled in the demo. Existing account entitlements are preserved during the migration.</p></section>
    <section><h2>Availability and moderation</h2><p>Features and monitoring depend on service and provider availability. We may review, suspend or remove abusive submissions or restrict access where needed to operate the service. Historical measurements may remain available even when a website is no longer reachable. Administrative changes are recorded.</p></section>
    <section><h2>Questions and account requests</h2><p>See the <Link href="/privacy">privacy information</Link> for how account and public profile information is used. {siteConfig.email ? <>Contact <a href={"mailto:" + siteConfig.email}>{siteConfig.email}</a> for support.</> : "A support address and any additional commercial terms will be published before public registration and paid access open."}</p></section>
  </EditorialPage>;
}
