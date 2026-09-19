import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | TheFastestWeb",
  description: "Terms of Service for TheFastestWeb.site",
};

export default function TermsPage() {
  return (
    <div className="py-[60px] px-5 pb-[80px]">
      <div className="max-w-[660px] mx-auto">
        <h1 className="font-display text-[clamp(1.8rem,3.5vw,2.4rem)] font-[900] tracking-[-0.03em] mb-2">
          Terms of Service
        </h1>
        <p className="text-text-muted text-[0.82rem] mb-10">Last updated: March 2026</p>

        <div className="space-y-8 text-[0.92rem] text-text-secondary leading-[1.75]">

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">1. Acceptance</h2>
            <p>
              By using TheFastestWeb (&quot;the Service&quot;), you agree to these Terms. If you do not agree, do not use the Service. The Service is operated by TheFastestWeb (thefastestweb.site).
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">2. What the Service Does</h2>
            <p>
              TheFastestWeb is a public speed leaderboard and monitoring tool for websites. It allows users to test their website&apos;s performance, submit their site for listing, and receive daily speed monitoring with trend alerts.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">3. Accounts</h2>
            <p>
              You must sign in with a Google account to submit a website. You are responsible for maintaining the security of your account. You must not use another person&apos;s account or submit websites you do not own or have permission to submit.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">4. Submitted Content</h2>
            <p>
              By submitting a website, you confirm that you own or have permission to list it. We reserve the right to remove any listing that:
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Contains illegal, harmful, or deceptive content</li>
              <li>Violates third-party intellectual property rights</li>
              <li>Is submitted with false or misleading information</li>
              <li>We determine, at our discretion, is inappropriate for the directory</li>
              <li>Has been inactive for 30 consecutive days (free plan)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">5. Free and Pro Plans</h2>
            <p>
              The free plan allows submission of one website with a dofollow backlink. Free plan listings require a TheFastestWeb badge to be embedded on your site homepage (see Section 6). Listings are paused after 10 consecutive days without logging in and permanently removed after 30 days of inactivity; logging back in reactivates your listing instantly.
            </p>
            <p className="mt-2">
              The Pro plan is a one-time payment of $9 and includes unlimited website submissions, dofollow backlinks, no badge requirement, and lifetime tracking with no inactivity removal. Pro upgrades are non-refundable once the benefits have been applied to your account.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">6. Badge Embed Requirement (Free Plan)</h2>
            <p>
              Free plan users must embed a TheFastestWeb speed badge on their site homepage before submission is accepted. By embedding the badge, you confirm you have permission to place third-party content on that page.
            </p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>We periodically verify the badge is present on your homepage.</li>
              <li>If the badge is removed, you will receive a warning email. If it remains missing on the next check, your listing and all associated data will be permanently deleted.</li>
              <li>Pro plan users are exempt from the badge requirement.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">7. Ad Slots</h2>
            <p>
              Ad slots are sold as monthly subscriptions at $19/month. You may cancel at any time; your ad will remain active until the end of the current billing period. We reserve the right to reject or remove ad content that violates these Terms or is deemed inappropriate.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">8. Speed Testing</h2>
            <p>
              Speed tests are performed using the Google PageSpeed Insights API. Results may vary between runs due to the nature of Lighthouse testing. We do not guarantee specific scores or outcomes. The public speed test tool is rate-limited to 10 tests per hour per IP address.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">9. Backlinks</h2>
            <p>
              Both free and Pro listings receive a dofollow backlink. Backlinks are provided as part of the listing service and are not guaranteed to improve search rankings. We reserve the right to modify link attributes in accordance with search engine guidelines.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">10. Prohibited Use</h2>
            <p>You may not use the Service to:</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Scrape, crawl, or bulk-test URLs in an automated manner</li>
              <li>Attempt to game or manipulate leaderboard rankings</li>
              <li>Submit spam, phishing, or malware sites</li>
              <li>Interfere with or disrupt the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">11. Disclaimer</h2>
            <p>
              The Service is provided &quot;as is&quot; without warranties of any kind. We do not guarantee uptime, accuracy of speed scores, or uninterrupted access. We are not liable for any damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">12. Changes</h2>
            <p>
              We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">13. Contact</h2>
            <p>
              Questions? Email us at{" "}
              <a href="mailto:thefastestwebsite@gmail.com" className="text-accent hover:underline">
                thefastestwebsite@gmail.com
              </a>.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
