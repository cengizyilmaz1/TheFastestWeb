const ownerIndieToolsDestinations = new Set([
  "https://indietools.app", "https://indietools.app/",
  "https://www.indietools.app", "https://www.indietools.app/",
]);

/** Called by the server page with ownership resolved from the database. */
export function siteVisitLinkRel(site: {
  tier: "free" | "pro"; slug: string; url: string; ownerIsAdmin: boolean;
}): string {
  const approvedOwnerProduct = site.ownerIsAdmin === true && site.slug === "indietools"
    && ownerIndieToolsDestinations.has(site.url);
  return site.tier === "pro" || approvedOwnerProduct ? "noopener noreferrer" : "nofollow noopener noreferrer";
}
