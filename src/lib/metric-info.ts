export const METRIC_INFO: Record<string, { name: string; good: string; tip: string }> = {
  FCP: {
    name: "First Contentful Paint",
    good: "Under 1.8s",
    tip: "Reduce server response time, eliminate render-blocking resources, and inline critical CSS.",
  },
  LCP: {
    name: "Largest Contentful Paint",
    good: "Under 2.5s",
    tip: "Optimize your largest image or text block. Use next-gen formats (WebP/AVIF), preload hero images, and use a CDN.",
  },
  CLS: {
    name: "Cumulative Layout Shift",
    good: "Under 0.1",
    tip: "Set explicit width/height on images and embeds. Avoid inserting content above existing content dynamically.",
  },
  TBT: {
    name: "Total Blocking Time",
    good: "Under 200ms",
    tip: "Break up long JavaScript tasks, defer non-critical JS, and remove unused code.",
  },
  TTI: {
    name: "Time to Interactive",
    good: "Under 3.8s",
    tip: "Minimize main-thread work. Reduce JS execution time and use code splitting.",
  },
  SI: {
    name: "Speed Index",
    good: "Under 3.4s",
    tip: "Ensure visible content loads early. Optimize critical rendering path and reduce content paint delays.",
  },
};
