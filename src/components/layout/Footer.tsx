import Link from "next/link";
import Image from "next/image";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import { siteConfig } from "@/config/site";

const groups: { title: string; links: [string, string][] }[] = [
  { title: "Directory", links: [["/explore", "Explore websites"], ["/leaderboard", "Rankings"], ["/compare", "Compare websites"], ["/founders", "Founders"]] },
  { title: "Measure", links: [["/test", "Test a site"], ["/submit", "Submit website"], ["/methodology", "How we measure"], ["/pricing", "Plans & sponsorship"]] },
  { title: "About", links: [["/about", "About"], ["/blog", "Journal"], ["/privacy", "Privacy"], ["/terms", "Terms"]] },
];

export function Footer() {
  return <footer className="mt-6 border-t border-border bg-bg-main">
    <div className="mx-auto max-w-[1240px] px-5 pb-7 pt-10 sm:px-8 sm:pt-14">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-5 border-b border-border pb-9">
        <p className="max-w-[24ch] text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Good websites deserve to be discovered.</p>
        <Link href="/explore" className="button-secondary">Explore the directory <ArrowUpRightIcon size={17} aria-hidden /></Link>
      </div>
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1.9fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-bold tracking-[-0.045em] text-text-primary no-underline font-stretch-[118%]">
            <Image src="/favicon/favicon-96x96.png" alt="" width={32} height={32} className="h-8 w-8" />{siteConfig.name}
          </Link>
          <p className="mt-4 max-w-[31ch] text-sm leading-relaxed text-text-secondary">Discover the makers, products, and ideas behind a faster web.</p>
          <p className="mt-5 text-xs text-text-muted">Real measurements. Open methodology.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 text-sm sm:grid-cols-3">
          {groups.map((group) => <div key={group.title}>
            <p className="font-semibold text-text-primary">{group.title}</p>
            <ul className="mt-4 space-y-1">
              {group.links.map(([href, label]) => <li key={href}><Link href={href} className="footer-link">{label}</Link></li>)}
              {group.title === "About" && siteConfig.email && <li><a className="footer-link" href={"mailto:" + siteConfig.email}>Contact</a></li>}
              {group.title === "Directory" && siteConfig.indieToolsUrl && <li><a className="footer-link" href={siteConfig.indieToolsUrl} rel="noopener noreferrer">Discover IndieTools</a></li>}
            </ul>
          </div>)}
        </nav>
      </div>
      <div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-border pt-6 text-xs text-text-muted">
        <span>© {new Date().getUTCFullYear()} {siteConfig.name}</span><span>Built for people who care about performance.</span>
      </div>
    </div>
  </footer>;
}
