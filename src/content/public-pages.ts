import { siteConfig } from "@/config/site";

export interface PublicPageSection { id: string; title: string; paragraphs: string[]; bullets?: string[]; items?: {title: string; paragraphs: string[]}[]; after?: string[]; }
export interface PublicPageContent { title: string; description: string; path: string; updated?: string; sections: PublicPageSection[]; }

export const publicPages: Record<string, PublicPageContent> = {
  pricing: {
    title: "A small price for your next big thing.",
    description: "List one website for free, or unlock unlimited submissions with one Pro payment. Your performance score is always earned by your website.",
    path: "/pricing",
    sections: [
      { id: "free", title: "Free: $0", paragraphs: ["One website listing, recorded performance results and scheduled speed monitoring. A TheFastestWeb badge on your homepage is required. Listing and monitoring depend on eligibility and service availability."] },
      { id: "pro", title: "Pro: $9 USD, one-time", paragraphs: ["Account access for unlimited website submissions with no badge requirement. A one-time payment, not a recurring listing subscription. Dodo Payments handles checkout; applicable taxes and the final amount are shown there."] },
      { id: "advertising", title: "Sidebar advertising: $19 USD per month", paragraphs: ["One sponsored desktop sidebar placement, subject to inventory, listing ownership and creative approval. Advertising is separate from organic rankings. Review placement details at /advertise."] },
    ],
  },
  advertise: {
    title: "Put your product beside the leaderboard.",
    description: "Reach people exploring website performance with a sponsored sidebar placement. Clear monthly pricing, a direct website link and your published product details.",
    path: "/advertise",
    sections: [
      { id: "placement", title: "A place alongside the rankings", paragraphs: ["Your placement appears in an available left or right sidebar on desktop layouts wider than 1100 pixels. Sidebars are hidden on smaller screens. A placement contains the website icon, name, tagline and a link to its destination.", "Sponsored placements are separate from the leaderboard. Buying an ad does not change a website’s measured performance score or organic position."] },
      { id: "pricing", title: "$19 USD per month", paragraphs: ["One placement is billed monthly through Dodo Payments. Availability is checked before checkout. Applicable taxes and the final amount are shown at checkout; the subscription renews until cancelled or its billing term ends."] },
      { id: "requirements", title: "Start with a published website", paragraphs: ["Sign in using the account that owns the published listing, then use its URL to request a placement. The checkout uses the listing’s published name and tagline. Listing ownership and creative approval are required; a purchase does not bypass content review."] },
      { id: "cancellation", title: "Manage your subscription", paragraphs: ["Request cancellation through your billing portal or contact " + siteConfig.email + ". Cancellation stops future renewals; a valid paid placement remains available until the end of its paid period."] },
    ],
  },
  "privacy": {
    "title": "Privacy policy",
    "description": "How TheFastestWeb handles account information, website measurements, email preferences and privacy requests.",
    "path": "/privacy",
    "updated": "2026-09-20",
    "sections": [
      {
        "id": "overview",
        "title": "Overview",
        "paragraphs": [
          "TheFastestWeb (\"we\", \"our\", \"us\") is operated by " + siteConfig.ownerName + ". This policy explains what data we collect, how we use it, and how to contact us about your information."
        ]
      },
      {
        "id": "data-we-collect",
        "title": "Data We Collect",
        "paragraphs": [],
        "items": [
          {
            "title": "Account data (when you sign in)",
            "paragraphs": [
              "When you sign in with Google, we receive your name, email address, and profile picture. We use this information to maintain your account and associate it with websites you manage. Your email is not published. A public founder profile requires a separate opt-in."
            ]
          },
          {
            "title": "Submitted site data",
            "paragraphs": [
              "When you submit a website, we store the URL, site name, description, category, country of origin, and speed test results. This data powers the leaderboard and daily retesting. The country describes the product’s origin, not your citizenship or the location of its hosting server."
            ]
          },
          {
            "title": "Speed test data",
            "paragraphs": [
              "We store tested URLs and performance measurements. Request identifiers are used to enforce rate limits and prevent abuse. Signed-in submissions are associated with the account that requested them."
            ]
          },
          {
            "title": "Payment data",
            "paragraphs": [
              "Dodo Payments processes payments and manages billing. We do not store card numbers or card security codes. We retain order references, amounts, payment status, and subscription records to provide purchases and reconcile refunds or cancellations."
            ]
          },
          {
            "title": "Ad slot data",
            "paragraphs": [
              "If you purchase an ad slot, we store your website name, URL, and tagline to display it. Click counts use a daily pseudonymous identifier to reduce duplicates; the click record does not retain the raw IP address, browser, or referrer."
            ]
          },
          {
            "title": "Badge verification",
            "paragraphs": [
              "When a free plan user submits a site, we fetch their homepage HTML server-side to verify the TheFastestWeb badge is present. We do not store the HTML content — only whether the badge was found (pass/fail). We may re-check periodically as part of badge compliance monitoring."
            ]
          }
        ]
      },
      {
        "id": "how-we-use-your-data",
        "title": "How We Use Your Data",
        "paragraphs": [],
        "bullets": [
          "To display your site on the public leaderboard (if you opt in)",
          "To run daily speed retests and send trend alert emails",
          "To send transactional emails (Pro upgrade confirmation, welcome email)",
          "To enforce rate limits and prevent abuse",
          "To provide ad click reports to advertisers",
          "To verify badge embed compliance on free plan homepages",
          "To manage listing visibility and your monitoring preferences"
        ],
        "after": [
          "We do not sell your data. We do not use your data for advertising purposes."
        ]
      },
      {
        "id": "third-party-services",
        "title": "Third-Party Services",
        "paragraphs": [],
        "bullets": [
          "Google OAuth: used for sign-in. Governed by Google's Privacy Policy.",
          "Google PageSpeed Insights API: used to run speed tests. URLs you test are sent to Google's API.",
          "Dodo Payments: payment processing, invoices, subscriptions, and billing support.",
          "Self-hosted infrastructure: application hosting, PostgreSQL storage, and Redis queues managed through Coolify.",
          "Microsoft 365: transactional email delivery through Microsoft Graph when email is enabled.",
          "Cloudflare R2: storage for generated website screenshots when screenshot storage is enabled.",
          "Visitor analytics: DataFast measures public page visits in cookieless mode. It uses a pseudonymous identifier derived by the provider from signals including IP address, browser information, domain and a daily rotating salt. Private account pages, query strings and sensitive referrers are excluded. Eligible initial purchases can be linked to the current visit using their confirmed amount, currency and transaction ID; no account name or email is sent for attribution. Longer-term and cross-day attribution is limited. Google Analytics is not loaded.",
          "Crawler analytics: When enabled, the separate DataFast server integration observes requests identified as AI or search crawlers. It sends the public page path and crawler user agent, and may send the crawler IP when our trusted proxy is configured for IP verification. It excludes private routes, query strings, cookies and authorization headers. Crawler classifications are estimates, not proof that a visitor is human."
        ]
      },
      {
        "id": "data-retention",
        "title": "Data Retention",
        "paragraphs": [
          "We retain account information, website measurements, and operational records while needed to provide the service. Billing records may need to be retained for accounting and dispute handling. Contact us to request deletion or ask which records are held about you."
        ]
      },
      {
        "id": "your-rights",
        "title": "Your Rights",
        "paragraphs": [
          "You can request to:"
        ],
        "bullets": [
          "Access the data we hold about you",
          "Delete your account and associated data",
          "Remove your site from the public leaderboard"
        ],
        "after": [
          "To make a request, email us at " + siteConfig.email + "."
        ]
      },
      {
        "id": "contact",
        "title": "Contact",
        "paragraphs": [
          "Questions about this policy? Email us at " + siteConfig.email + " ."
        ]
      }
    ]
  },
  "terms": {
    "title": "Terms of service",
    "description": "Read the terms for using TheFastestWeb, including website submissions, account responsibilities and paid services.",
    "path": "/terms",
    "updated": "2026-09-20",
    "sections": [
      {
        "id": "acceptance",
        "title": "Acceptance",
        "paragraphs": [
          "By using TheFastestWeb (\"the Service\"), you agree to these Terms. If you do not agree, do not use the Service. The Service is operated by " + siteConfig.ownerName + "."
        ]
      },
      {
        "id": "what-the-service-does",
        "title": "What the Service Does",
        "paragraphs": [
          "TheFastestWeb is a public speed leaderboard and monitoring tool for websites. It lets users test website performance, submit listings, and view recorded results. Scheduled retests and email alerts depend on service availability and the account's preferences."
        ]
      },
      {
        "id": "accounts",
        "title": "Accounts",
        "paragraphs": [
          "You must sign in with a Google account to submit a website. You are responsible for maintaining the security of your account. You must not use another person's account or submit websites you do not own or have permission to submit."
        ]
      },
      {
        "id": "submitted-content",
        "title": "Submitted Content",
        "paragraphs": [
          "By submitting a website, you confirm that you own or have permission to list it. We reserve the right to remove any listing that:"
        ],
        "bullets": [
          "Contains illegal, harmful, or deceptive content",
          "Violates third-party intellectual property rights",
          "Is submitted with false or misleading information",
          "We determine, at our discretion, is inappropriate for the directory"
        ]
      },
      {
        "id": "free-and-pro-plans",
        "title": "Free and Pro Plans",
        "paragraphs": [
          "The free plan allows submission of one website with a dofollow backlink. Free plan listings require a TheFastestWeb badge to be embedded on your site homepage (see Section 6). Listing and monitoring availability depend on the site remaining eligible and accessible.",
          "The Pro plan is a one-time payment of $9 and includes unlimited website submissions, dofollow backlinks, and no badge requirement. Dodo Payments handles checkout and billing. Any applicable taxes and the final amount are shown at checkout. For billing issues or refund requests, contact us using the address below; applicable statutory rights are unaffected."
        ]
      },
      {
        "id": "badge-embed-requirement-free-plan",
        "title": "Badge Embed Requirement (Free Plan)",
        "paragraphs": [
          "Free plan users must embed a TheFastestWeb speed badge on their site homepage before submission is accepted. By embedding the badge, you confirm you have permission to place third-party content on that page."
        ],
        "bullets": [
          "We periodically verify the badge is present on your homepage.",
          "Missing or invalid badges may affect a free listing's eligibility.",
          "Pro plan users are exempt from the badge requirement."
        ]
      },
      {
        "id": "ad-slots",
        "title": "Ad Slots",
        "paragraphs": [
          "Ad slots are monthly subscriptions at $19/month through Dodo Payments. You may request cancellation through your billing portal or by contacting us. Cancellation stops future renewals, and a valid paid placement remains available until the end of its paid period. We reserve the right to reject or remove ad content that violates these Terms."
        ]
      },
      {
        "id": "speed-testing",
        "title": "Speed Testing",
        "paragraphs": [
          "Speed tests use the Google PageSpeed Insights API. Lighthouse lab results may vary between runs and devices. We do not guarantee specific scores, search rankings, or other outcomes. Usage limits and provider availability may restrict the number of tests."
        ]
      },
      {
        "id": "backlinks",
        "title": "Backlinks",
        "paragraphs": [
          "Both free and Pro listings receive a dofollow backlink. Backlinks are provided as part of the listing service and are not guaranteed to improve search rankings. We reserve the right to modify link attributes in accordance with search engine guidelines."
        ]
      },
      {
        "id": "prohibited-use",
        "title": "Prohibited Use",
        "paragraphs": [
          "You may not use the Service to:"
        ],
        "bullets": [
          "Scrape, crawl, or bulk-test URLs in an automated manner",
          "Attempt to game or manipulate leaderboard rankings",
          "Submit spam, phishing, or malware sites",
          "Interfere with or disrupt the Service"
        ]
      },
      {
        "id": "disclaimer",
        "title": "Disclaimer",
        "paragraphs": [
          "The Service is provided \"as is\" without warranties of any kind. We do not guarantee uptime, accuracy of speed scores, or uninterrupted access. We are not liable for any damages arising from your use of the Service."
        ]
      },
      {
        "id": "changes",
        "title": "Changes",
        "paragraphs": [
          "We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the updated Terms."
        ]
      },
      {
        "id": "contact",
        "title": "Contact",
        "paragraphs": [
          "Questions? Email us at " + siteConfig.email + " ."
        ]
      }
    ]
  }
};
