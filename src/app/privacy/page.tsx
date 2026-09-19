import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | TheFastestWeb",
  description: "Privacy Policy for TheFastestWeb.site",
};

export default function PrivacyPage() {
  return (
    <div className="py-[60px] px-5 pb-[80px]">
      <div className="max-w-[660px] mx-auto">
        <h1 className="font-display text-[clamp(1.8rem,3.5vw,2.4rem)] font-[900] tracking-[-0.03em] mb-2">
          Privacy Policy
        </h1>
        <p className="text-text-muted text-[0.82rem] mb-10">Last updated: March 2026</p>

        <div className="space-y-8 text-[0.92rem] text-text-secondary leading-[1.75]">

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">1. Overview</h2>
            <p>
              TheFastestWeb (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) operates thefastestweb.site. This policy explains what data we collect, how we use it, and your rights. We keep it simple: we collect only what we need to run the service.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">2. Data We Collect</h2>
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-text-primary">Account data (when you sign in)</p>
                <p>When you sign in with Google, we receive your name, email address, and profile picture from Google. We store this to link your submitted sites to your profile.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Submitted site data</p>
                <p>When you submit a website, we store the URL, site name, description, category, and speed test results. This data powers the leaderboard and daily retesting.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Speed test data</p>
                <p>When you use the public speed test tool, we log the URL tested, the score, and your IP address for rate limiting purposes. We do not link anonymous speed tests to any user account.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Payment data</p>
                <p>Payments are processed by Polar (our payment provider). We do not store your card details. We receive a confirmation of payment and your email to fulfill your order.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Ad slot data</p>
                <p>If you purchase an ad slot, we store your website name, URL, and tagline to display your ad. We also log clicks on your ad (IP, browser, referrer) to provide performance reports.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Badge verification</p>
                <p>When a free plan user submits a site, we fetch their homepage HTML server-side to verify the TheFastestWeb badge is present. We do not store the HTML content — only whether the badge was found (pass/fail). We may re-check periodically as part of badge compliance monitoring.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">3. How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>To display your site on the public leaderboard (if you opt in)</li>
              <li>To run daily speed retests and send trend alert emails</li>
              <li>To send transactional emails (Pro upgrade confirmation, welcome email)</li>
              <li>To enforce rate limits and prevent abuse</li>
              <li>To provide ad click reports to advertisers</li>
              <li>To verify badge embed compliance on free plan homepages</li>
              <li>To enforce inactivity-based listing pause (10 days) and removal (30 days)</li>
            </ul>
            <p className="mt-3">We do not sell your data. We do not use your data for advertising purposes.</p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">4. Third-Party Services</h2>
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-text-primary">Google OAuth</strong>: used for sign-in. Governed by Google&apos;s Privacy Policy.</li>
              <li><strong className="text-text-primary">Google PageSpeed Insights API</strong>: used to run speed tests. URLs you test are sent to Google&apos;s API.</li>
              <li><strong className="text-text-primary">Supabase</strong> — database and authentication infrastructure.</li>
              <li><strong className="text-text-primary">Polar</strong> — payment processing for Pro upgrades and ad slots.</li>
              <li><strong className="text-text-primary">Vercel</strong> — hosting provider. May log request metadata.</li>
              <li><strong className="text-text-primary">Resend</strong> — transactional email delivery.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">5. Data Retention</h2>
            <p>
              We retain your account data and submitted site data for as long as your account is active. Speed test history is retained indefinitely to power trend charts. You can request deletion of your data at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">6. Your Rights</h2>
            <p>You can request to:</p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li>Access the data we hold about you</li>
              <li>Delete your account and associated data</li>
              <li>Remove your site from the public leaderboard</li>
            </ul>
            <p className="mt-2">To make a request, email us at <a href="mailto:thefastestwebsite@gmail.com" className="text-accent hover:underline">thefastestwebsite@gmail.com</a>.</p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">7. Cookies</h2>
            <p>
              We use a session cookie set by Supabase to keep you signed in. We do not use tracking cookies or third-party advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="font-display font-bold text-[1.05rem] text-text-primary mb-2">8. Contact</h2>
            <p>
              Questions about this policy? Email us at{" "}
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
