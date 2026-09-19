import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";

export type EditorialSection = { id: string; title: string; body: ReactNode };
export type EditorialLink = { href: string; label: string; note: string };

/** The shared grid: a narrow column for headings and labels, a wide one for reading. */
const columns = "grid gap-x-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]";

/**
 * Long-form pages (about, methodology, privacy, terms). The headline sits on its own row, the
 * contents list doubles as the header's right column, and each section pins its heading beside
 * a 68ch reading column.
 */
export function EditorialPage({ eyebrow, title, intro, sections, lead, next, contents = true }: {
  eyebrow: string; title: string; intro: string; sections: EditorialSection[]; lead?: ReactNode; next?: EditorialLink[];
  /** Short pages can drop the contents list; the intro then lines up with the reading column. */
  contents?: boolean;
}) {
  return <article className="mx-auto max-w-[1240px] px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20">
    <header>
      <p className="page-eyebrow mb-5">{eyebrow}</p>
      <h1 className="page-title max-w-[18ch]">{title}</h1>
      <div className={columns + " mt-8 gap-y-10 sm:mt-10"}>
        <p className={"text-lg leading-relaxed text-text-secondary sm:text-xl " + (contents ? "max-w-[40ch]" : "max-w-[46ch] lg:col-start-2 lg:text-[1.375rem] lg:leading-[1.55]")}>{intro}</p>
        {contents && <nav aria-label="On this page" className="self-end">
          <ol className="text-[15px]">
            {sections.map((section, index) => <li key={section.id} className="border-t border-border last:border-b">
              <a href={"#" + section.id} className="group flex min-h-12 items-baseline gap-5 py-3 text-text-secondary no-underline transition-colors hover:text-text-primary">
                <span aria-hidden className="stat-value w-6 flex-none text-xs text-text-muted">{String(index + 1).padStart(2, "0")}</span>
                <span className="bg-[linear-gradient(var(--brand-fill),var(--brand-fill))] bg-[length:0%_2px] bg-[position:0_100%] bg-no-repeat pb-0.5 font-medium transition-[background-size] duration-300 ease-out group-hover:bg-[length:100%_2px]">{section.title}</span>
              </a>
            </li>)}
          </ol>
        </nav>}
      </div>
      <div aria-hidden className="tick-rule mt-12 sm:mt-16" />
    </header>

    {lead && <div className="mt-12 sm:mt-16">{lead}</div>}

    <div className="mt-6 sm:mt-10">
      {sections.map((section, index) => <section key={section.id} id={section.id} aria-labelledby={section.id + "-title"} className={columns + " scroll-mt-28 gap-y-5 border-border py-10 sm:py-14 " + (index ? "border-t" : "")}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <span aria-hidden className="stat-value text-xs text-text-muted">{String(index + 1).padStart(2, "0")}</span>
          <h2 id={section.id + "-title"} className="section-title mt-3 max-w-[20ch] text-[clamp(1.5rem,2.5vw,2.125rem)]">{section.title}</h2>
        </div>
        <div className="editorial-body max-w-[68ch] [&>*:first-child]:mt-0 [&>p+p]:mt-5">{section.body}</div>
      </section>)}
    </div>

    {next && next.length > 0 && <nav aria-label="Continue" className={columns + " mt-6 gap-y-6 border-t border-border-light pt-10 sm:pt-14"}>
      <h2 className="section-title text-[clamp(1.5rem,2.5vw,2.125rem)]">Where to next</h2>
      <ul>
        {next.map((item) => <li key={item.href} className="border-b border-border first:border-t">
          <Link href={item.href} className="group flex items-center justify-between gap-6 py-5 text-text-primary no-underline sm:py-6">
            <span className="min-w-0">
              <span className="bg-[linear-gradient(var(--brand-fill),var(--brand-fill))] bg-[length:0%_38%] bg-[position:0_88%] bg-no-repeat text-[clamp(1.5rem,3vw,2.5rem)] font-semibold leading-[1.15] tracking-[-.045em] transition-[background-size] duration-300 ease-out font-stretch-[116%] group-hover:bg-[length:100%_38%]">{item.label}</span>
              <span className="mt-1.5 block text-sm text-text-secondary">{item.note}</span>
            </span>
            <ArrowUpRightIcon size={26} aria-hidden className="flex-none text-text-muted transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text-primary group-active:translate-x-0 group-active:translate-y-0" />
          </Link>
        </li>)}
      </ul>
    </nav>}
  </article>;
}
