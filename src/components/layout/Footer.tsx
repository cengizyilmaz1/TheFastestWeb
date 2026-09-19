import Link from "next/link";
import Image from "next/image";
import { siteConfig } from "@/config/site";

export function Footer() {
  return <footer className="border-t border-border px-5 py-10 sm:px-8">
    <div className="mx-auto flex max-w-[1120px] flex-col justify-between gap-8 sm:flex-row">
      <div>
        <Link href="/" className="inline-flex items-center gap-2 text-base font-semibold text-text-primary no-underline">
          <Image src="/logo.png" alt="" width={28} height={28} />{siteConfig.name}
        </Link>
        <p className="mt-3 max-w-[28ch] text-sm text-text-secondary">A place for people who make the web faster.</p>
      </div>
      <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm text-text-secondary sm:grid-cols-3">
        {[["/about", "About"], ["/methodology", "How we measure"], ["/compare", "Compare websites"], ["/blog", "Journal"], ["/pricing", "Plans & sponsorship"], ["/privacy", "Privacy"], ["/terms", "Terms"]].map(([href, label]) => <Link key={href} href={href} className="hover:text-text-primary">{label}</Link>)}
        {siteConfig.email && <a className="hover:text-text-primary" href={"mailto:" + siteConfig.email}>Contact</a>}
        {siteConfig.indieToolsUrl && <a className="hover:text-text-primary" href={siteConfig.indieToolsUrl} rel="noopener noreferrer">Discover IndieTools ↗</a>}
      </nav>
    </div>
    <div className="mx-auto mt-10 flex max-w-[1120px] flex-wrap justify-between gap-3 border-t border-border pt-5 text-xs text-text-muted">
      <span>© {new Date().getUTCFullYear()} {siteConfig.name}</span><span>Lab measurements. Transparent methodology. Real websites.</span>
    </div>
  </footer>;
}
