import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { listFounders } from "@/modules/sites/directory";
import { FounderAvatar, countryName } from "./FounderAvatar";

export type FounderRow = Awaited<ReturnType<typeof listFounders>>["founders"][number];

/** People are not cards: one hairline row each, the name set large, the rest kept quiet. */
export function FounderList({ founders }: { founders: FounderRow[] }) {
  return <ul className="border-t border-border-light">{founders.map((founder) => { const country = countryName(founder.countryCode); return <li key={founder.slug} className="border-b border-border">
    <Link href={`/founders/${founder.slug}`} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 py-5 no-underline transition-colors hover:bg-bg-main sm:gap-x-6 sm:py-6 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.25fr)_9rem_auto]">
      <FounderAvatar name={founder.name} avatarUrl={founder.avatarUrl} className="transition-transform duration-300 group-hover:-rotate-3" />
      <span className="min-w-0">
        <span className="block text-[clamp(1.25rem,2.2vw,1.875rem)] font-semibold leading-[1.15] tracking-[-.04em] text-text-primary font-stretch-[116%] [overflow-wrap:anywhere]"><span className="bg-[linear-gradient(var(--brand-fill),var(--brand-fill))] bg-[length:0%_38%] bg-[position:0_88%] bg-no-repeat transition-[background-size] duration-300 ease-out group-hover:bg-[length:100%_38%]">{founder.name}</span></span>
        {country && <span className="mt-1 block text-[13px] text-text-muted lg:hidden">{country}</span>}
        <span className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-text-secondary lg:hidden">{founder.bio || "Building for the web."}</span>
      </span>
      <span className="hidden max-w-[52ch] text-sm leading-relaxed text-text-secondary lg:line-clamp-2">{founder.bio || "Building for the web."}</span>
      <span className="hidden text-[13px] text-text-muted lg:block">{country}</span>
      <span aria-hidden className="icon-button transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"><ArrowUpRightIcon size={18} /></span>
    </Link>
  </li>; })}</ul>;
}
