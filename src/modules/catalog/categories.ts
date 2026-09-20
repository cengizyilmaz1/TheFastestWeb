/** IndieTools public taxonomy, checked at https://www.indietools.app/categories
 * on 2026-09-20. Original TheFastestWeb slugs remain permanent destinations. */
export const legacyCategorySlugs = ["saas", "tool", "directory", "agency", "ecommerce", "blog", "portfolio", "other"] as const;
export const indieCategorySlugs = ["ai", "analytics", "cms", "design", "developer-tools", "finance", "fitness", "games", "lifestyle", "marketing", "personal-life", "productivity", "programming", "seo", "social-media"] as const;
export const categorySlugs = [...legacyCategorySlugs, ...indieCategorySlugs] as const;
export type CategorySlug = typeof categorySlugs[number];
export type LegacyCategorySlug = typeof legacyCategorySlugs[number];

export const categoryCatalog: readonly { slug: CategorySlug; name: string; description: string; focus: string; group: "IndieTools categories" | "Website types" }[] = [
  { slug: "ai", name: "AI", description: "AI assistants, generation tools and machine-learning products with a public website.", focus: "Compare how quickly the public landing page explains the product before an interactive model or workspace loads.", group: "IndieTools categories" },
  { slug: "analytics", name: "Analytics", description: "Website analytics, audience measurement and reporting products.", focus: "Look at loading and blocking time on the public product page; a public test does not measure an authenticated dashboard.", group: "IndieTools categories" },
  { slug: "cms", name: "CMS", description: "Content management systems, publishing platforms and headless CMS products.", focus: "Compare the public site rather than assuming its score describes every website built with the CMS.", group: "IndieTools categories" },
  { slug: "design", name: "Design", description: "Design tools, creative resources and products for visual work.", focus: "Image-heavy showcases make largest contentful paint and layout stability useful alongside the overall score.", group: "IndieTools categories" },
  { slug: "developer-tools", name: "Developer tools", description: "Developer services, APIs, debugging tools and software development utilities.", focus: "Check the recorded mobile result and its date when comparing documentation-rich product pages.", group: "IndieTools categories" },
  { slug: "finance", name: "Finance", description: "Budgeting, invoicing, accounting and financial management product websites.", focus: "These results describe website loading performance, not a financial product's suitability, reliability or security.", group: "IndieTools categories" },
  { slug: "fitness", name: "Fitness", description: "Fitness, workout, training and activity product websites.", focus: "Compare mobile loading performance on public pages; scores do not evaluate training advice or health outcomes.", group: "IndieTools categories" },
  { slug: "games", name: "Games", description: "Browser games, gaming products and game-related websites.", focus: "A landing-page score describes page loading and does not benchmark frame rate or gameplay performance.", group: "IndieTools categories" },
  { slug: "lifestyle", name: "Lifestyle", description: "Lifestyle products for everyday interests, activities and experiences.", focus: "Read the individual report to see which URL was tested and when its performance was recorded.", group: "IndieTools categories" },
  { slug: "marketing", name: "Marketing", description: "Marketing platforms, growth tools, email products and campaign services.", focus: "Compare the effect of media, third-party scripts and interactive content through the published loading metrics.", group: "IndieTools categories" },
  { slug: "personal-life", name: "Personal life", description: "Products for personal organization, daily routines and individual projects.", focus: "A responsive public page can help visitors understand the product; the report measures that page, not private account screens.", group: "IndieTools categories" },
  { slug: "productivity", name: "Productivity", description: "Task management, note-taking, scheduling and workflow product websites.", focus: "Use the individual metrics to compare public pages without treating the score as a measure of the product's productivity benefits.", group: "IndieTools categories" },
  { slug: "programming", name: "Programming", description: "Programming resources, coding products and language-focused websites.", focus: "Public examples and embedded editors can affect loading; inspect blocking time as well as the overall score.", group: "IndieTools categories" },
  { slug: "seo", name: "SEO", description: "Search optimization tools, site auditing products and search research platforms.", focus: "A PageSpeed performance score is one lab measurement; it is not a search ranking or a complete SEO audit.", group: "IndieTools categories" },
  { slug: "social-media", name: "Social media", description: "Social publishing, scheduling, community and audience management products.", focus: "Embedded feeds and third-party media can affect page loading, so compare the measured URL and test date.", group: "IndieTools categories" },
  { slug: "saas", name: "SaaS", description: "Software-as-a-service products and hosted web applications.", focus: "The recorded score measures the submitted public URL, not every part of the application.", group: "Website types" },
  { slug: "tool", name: "Tools", description: "Useful web tools, utilities and focused online services.", focus: "Compare the published loading metrics and the measurement date for each tool.", group: "Website types" },
  { slug: "directory", name: "Directories", description: "Directories, searchable collections and listing websites.", focus: "Large collections can load differently from their detail pages; check the specific URL in each report.", group: "Website types" },
  { slug: "agency", name: "Agencies", description: "Agency, studio and professional service websites.", focus: "Project imagery and animation can affect loading; compare both contentful paint and layout stability.", group: "Website types" },
  { slug: "ecommerce", name: "E-commerce", description: "Online stores, shopping platforms and commerce websites.", focus: "Public homepage measurements do not represent every product page or checkout step.", group: "Website types" },
  { slug: "blog", name: "Blogs", description: "Blogs, editorial publications and content-led websites.", focus: "Images, fonts and embeds can affect article loading; follow each report to inspect its measured URL.", group: "Website types" },
  { slug: "portfolio", name: "Portfolios", description: "Portfolio websites, personal showcases and project collections.", focus: "Compare image loading and layout stability as well as the overall recorded score.", group: "Website types" },
  { slug: "other", name: "Other", description: "Public websites that do not fit one of the more specific categories.", focus: "Choose a specific category when it matches your website so visitors can make more relevant comparisons.", group: "Website types" },
];

export const findCategory = (slug: string) => categoryCatalog.find((category) => category.slug === slug);
export const categoryPath = (slug: CategorySlug) => `/fastest/${slug}`;
export function legacyCategory(slug: string): LegacyCategorySlug {
  return legacyCategorySlugs.find((value) => value === slug) ?? "other";
}
