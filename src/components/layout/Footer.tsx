import Link from "next/link";
import { siteConfig } from "@/config/site";

const groups = [
  { title: "Explore", links: [["Leaderboard", "/"], ["Categories", "/categories"], ["Blog", "/blog"], ["About", "/about"]] },
  { title: "Build with us", links: [["Submit a website", "/submit"], ["Pricing", "/pricing"], ["Advertise", "/advertise"], ["Contact", `mailto:${siteConfig.email}`]] },
  { title: "Resources", links: [["Privacy", "/privacy"], ["Terms", "/terms"], ["Markdown", "/markdown"], ["LLMs", "/llms.txt"], ["LLMs Full", "/llms-full.txt"]] },
];

export function Footer() {
  return <footer className="site-footer">
    <div className="mx-auto max-w-[960px]">
      <div className="grid grid-cols-[1.25fr_2fr] gap-10 max-[820px]:grid-cols-1 max-[820px]:gap-8">
        <div>
          <Link href="/" className="font-display text-xl font-semibold tracking-[-0.035em] text-text-primary">TheFastestWeb<span className="text-accent">.</span></Link>
          <p className="mt-3 max-w-[250px] text-[0.82rem] leading-7">Discover the web at its fastest. Measured performance, independent products.</p>
          <a href={siteConfig.ownerUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-xs hover:text-accent"><span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-[0.6rem] font-semibold text-accent">CY</span><span>Built by <span className="text-text-primary">{siteConfig.ownerName}</span></span></a>
        </div>
        <div className="grid grid-cols-3 gap-x-5 gap-y-8 max-[380px]:grid-cols-2">
          {groups.map(group => <nav key={group.title} aria-label={`Footer: ${group.title}`}><h2 className="mb-4 text-[0.75rem] font-semibold text-text-primary">{group.title}</h2><ul className="space-y-3 text-[0.78rem]">{group.links.map(([label, href]) => <li key={href}>{href.startsWith("mailto:") || href.endsWith(".txt") || href === "/markdown" ? <a href={href}>{label}</a> : <Link href={href}>{label}</Link>}</li>)}</ul></nav>)}
        </div>
      </div>
      <div className="mt-9 border-t border-border pt-6">
        <p className="text-[0.72rem] leading-6">Performance is measured. Rankings are earned.</p>
      </div>
    </div>
  </footer>;
}
