import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";

const scale = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const destinations: [string, string, string][] = [
  ["/explore", "Explore websites", "The directory and its recorded performance"],
  ["/leaderboard", "Rankings", "Mobile and desktop, measured the same way"],
  ["/blog", "Journal", "Practical guides to a faster web"],
  ["/test", "Test a site", "Run the current lab test"],
];

/**
 * Shared frame for the 404 and the error boundary. The needle rests at zero on the 0-100 rule:
 * nothing was measured here. No hooks, so it renders from server and client components alike.
 */
export function StatusPage({ code, eyebrow, title, description, actions, reference }: {
  code?: string; eyebrow?: string; title: string; description: string; actions: ReactNode; reference?: string;
}) {
  return <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-10 sm:px-8 sm:pb-28 sm:pt-14">
    {code && <p className="stat-value -ml-[.04em] text-[clamp(9.5rem,27vw,21rem)] font-medium leading-[.84] tracking-[-.07em] text-text-primary"><span className="sr-only">Error </span>{code}</p>}
    <div aria-hidden className={code ? "mt-6 sm:mt-10" : "mt-4"}>
      <div className="relative h-7"><span className="absolute left-0 top-0 h-full w-[3px] origin-bottom -skew-x-[18deg] rounded-sm bg-brand shadow-[0_0_14px_var(--brand-fill)]" /></div>
      <div className="tick-rule border-l border-l-text-muted" />
      <div className="stat-value mt-2 flex justify-between text-[11px] text-text-muted">{scale.map((mark) => <span key={mark} className="w-0 whitespace-nowrap first:w-auto last:w-auto [&:not(:first-child):not(:last-child)]:-translate-x-1/2">{mark}</span>)}</div>
    </div>

    <div className="mt-12 grid gap-x-16 gap-y-14 sm:mt-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div>
        {eyebrow && <p className="page-eyebrow mb-5">{eyebrow}</p>}
        <h1 className="page-title max-w-[16ch]">{title}</h1>
        <p className="page-description mt-6 text-lg">{description}</p>
        <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3">{actions}</div>
        {reference && <p className="mt-8 text-[13px] text-text-muted">Reference <span className="stat-value text-text-secondary">{reference}</span></p>}
      </div>
      <nav aria-label="Places to go" className="self-end">
        <ul className="text-[15px]">{destinations.map(([href, label, note]) => <li key={href} className="border-b border-border first:border-t">
          <Link href={href} className="group flex min-h-16 items-center justify-between gap-5 py-3.5 no-underline">
            <span><span className="block font-semibold text-text-primary">{label}</span><span className="mt-0.5 block text-[13px] text-text-muted">{note}</span></span>
            <ArrowUpRightIcon size={18} aria-hidden className="flex-none text-text-muted transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text-primary" />
          </Link>
        </li>)}</ul>
      </nav>
    </div>
  </div>;
}
