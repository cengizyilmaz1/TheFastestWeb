import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { siteConfig } from "@/config/site";

const groups = [
  { title: "Explore", links: [["Leaderboard", "/"], ["Categories", "/categories"], ["Blog", "/blog"], ["About", "/about"]] },
  { title: "Build with us", links: [["Submit a website", "/submit"], ["Pricing", "/pricing"], ["Advertise", "/advertise"], ["Contact", `mailto:${siteConfig.email}`]] },
  { title: "Resources", links: [["Privacy", "/privacy"], ["Terms", "/terms"], ["Markdown", "/markdown"], ["LLMs", "/llms.txt"], ["LLMs Full", "/llms-full.txt"]] },
];

export function Footer() {
  return <footer className="site-footer">
    <div className="mx-auto max-w-[960px]">
      <div className="grid grid-cols-[1.3fr_2fr] gap-12 max-[820px]:grid-cols-1 max-[820px]:gap-9">
        <div>
          <Link href="/" className="font-display text-[1.35rem] font-semibold tracking-[-0.035em] text-text-primary">TheFastestWeb<span className="text-accent">.</span></Link>
          <p className="mt-3 max-w-[280px] text-[0.84rem] leading-7">Discover the web at its fastest. Measured performance, independent products.</p>
          <Link href="/submit" className="site-footer-cta mt-6">Submit your website <ArrowUpRight size={15} aria-hidden="true" /></Link>
          <div className="mt-7">
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-text-secondary">Featured on</p>
            <a href="https://www.scrolllaunch.com/products/thefastestweb?ref=badge" target="_blank" rel="noopener" className="inline-flex rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              {/* eslint-disable-next-line @next/next/no-img-element -- Externally hosted badge keeps the provider's canonical URL. */}
              <img src="https://www.scrolllaunch.com/api/badge/thefastestweb" alt="Featured on ScrollLaunch" width="220" height="48" loading="lazy" />
            </a>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-x-6 gap-y-9 max-[420px]:grid-cols-2">
          {groups.map(group => <nav key={group.title} aria-label={`Footer: ${group.title}`}><h2 className="mb-4 text-[0.78rem] font-semibold text-text-primary">{group.title}</h2><ul className="space-y-3 text-[0.82rem]">{group.links.map(([label, href]) => <li key={href}>{href.startsWith("mailto:") || href.endsWith(".txt") || href === "/markdown" ? <a href={href}>{label}</a> : <Link href={href}>{label}</Link>}</li>)}</ul></nav>)}
        </div>
      </div>
      <div className="mt-11 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-border pt-6 text-[0.76rem] leading-6">
        <p>© {new Date().getFullYear()} {siteConfig.name}. Performance is measured. Rankings are earned.</p>
        <p>Built by <a href={siteConfig.ownerUrl} target="_blank" rel="noopener noreferrer" className="site-footer-owner">{siteConfig.ownerName}</a></p>
      </div>
    </div>
  </footer>;
}
