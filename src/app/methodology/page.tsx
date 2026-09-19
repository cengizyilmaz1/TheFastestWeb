import type { Metadata } from "next";
import { EditorialPage, type EditorialSection } from "@/components/layout/EditorialPage";
export const metadata: Metadata = { title: "How we measure website performance", description: "Two PageSpeed Insights lab samples per device, transparent tie-breaks and preserved weekly results. Read the TheFastestWeb methodology.", alternates: { canonical: "/methodology" } };

/** Every value below restates a rule from the sections that follow; nothing here is a separate claim. */
const standard: { term: string; value: string; numeric?: boolean }[] = [
  { term: "Method", value: "psi-v2-two-sample" },
  { term: "Source", value: "PageSpeed Insights lab tests" },
  { term: "Samples per device", value: "2", numeric: true },
  { term: "Devices", value: "Mobile and desktop, kept separate" },
  { term: "Saved result", value: "Mean of both samples" },
  { term: "Scores", value: "Rounded to a whole number" },
  { term: "Times", value: "Recorded in milliseconds" },
  { term: "Ranking algorithm", value: "ranking-v1" },
  { term: "Week", value: "Monday 00:00 UTC to the next Monday" },
  { term: "Archive", value: "Top 100 per device and collection" },
];

const tieBreaks = ["Higher performance score", "Lower largest contentful paint", "Lower cumulative layout shift", "Lower total blocking time", "Stable website ID"];

const periods: [string, string][] = [
  ["Weekly and monthly", "Latest eligible measurement during the period"],
  ["All time", "Each website’s best eligible result"],
  ["Most improved", "Current result against the latest eligible result before the period"],
  ["Newcomers", "Websites added during the period"],
];

/** The standard at a glance, drawn like the home page timing board: dark in both themes. */
function StandardBoard() {
  return <section aria-labelledby="standard-title" className="relative overflow-hidden rounded-[28px] border border-border bg-bg-main text-text-primary shadow-pop">
    <div aria-hidden className="dot-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
    <div className="relative px-5 pb-4 pt-6 sm:px-9 sm:pb-6 sm:pt-8">
      <h2 id="standard-title" className="text-xl font-semibold tracking-[-.03em] sm:text-2xl">The standard at a glance</h2>
      <p className="mt-1.5 text-sm text-text-muted">The current rules, in the order the sections below explain them.</p>
      <dl className="mt-7 grid gap-x-14 text-[15px] md:grid-cols-2">
        {standard.map((row) => <div key={row.term} className="flex items-baseline justify-between gap-6 border-t border-border py-3.5">
          <dt className="flex-none text-text-muted">{row.term}</dt>
          <dd className={"text-right font-semibold text-text-primary " + (row.numeric ? "stat-value text-lg leading-none" : "")}>{row.value}</dd>
        </div>)}
      </dl>
    </div>
  </section>;
}

const sections: EditorialSection[] = [
  { id: "samples", title: "Two samples. Two separate devices.", body: <><p>The current method, psi-v2-two-sample, runs two Google PageSpeed Insights lab tests for each selected device strategy. Mobile and desktop are measured separately. We average the two scores and each numeric metric; for two samples, that mean is also their median. Both samples must complete before a result can be saved.</p><p>Times are recorded in milliseconds and scores are rounded to the nearest whole number. If either sample lacks time to interactive, that metric remains unavailable. Failed tests do not become zero scores.</p></> },
  { id: "lab", title: "Lab performance is not field performance.", body: <><p>These are Lighthouse lab measurements from PageSpeed Insights. They describe a simulated visit and can vary with server load, network conditions, content and the upstream testing environment. They are not a Core Web Vitals assessment from real users. Total blocking time is a lab diagnostic, not interaction to next paint.</p><p>Use the results to investigate changes and compare measurements taken with the same method. A high score does not guarantee a particular experience for every visitor.</p></> },
  { id: "order", title: "A repeatable order.", body: <>
    <p>Weekly and monthly rankings use the latest eligible measurement during the period. All-time rankings use each website’s best eligible result. The current ranking-v1 algorithm orders by performance score, then lower largest contentful paint, lower cumulative layout shift, lower total blocking time and finally a stable website ID.</p>
    <div className="mt-8 rounded-2xl bg-bg-card p-6 sm:p-7">
      <h3 className="text-[15px] font-semibold text-text-primary">Tie-break order, ranking-v1</h3>
      <ol className="mt-4">{tieBreaks.map((rule, index) => <li key={rule} className="flex items-baseline gap-5 border-t border-border-light py-3 text-[15px] text-text-primary last:pb-0">
        <span aria-hidden className="stat-value w-5 flex-none text-xs text-text-muted">{index + 1}</span>{rule}
      </li>)}</ol>
    </div>
    <p className="mt-8">Most improved compares the current result with the latest eligible result before the period. Newcomers are websites added during that period. Mobile and desktop results always remain separate.</p>
    <dl className="mt-8 text-[15px]">{periods.map(([term, value]) => <div key={term} className="grid gap-x-8 gap-y-1 border-t border-border py-3.5 last:border-b sm:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="font-semibold text-text-primary">{term}</dt><dd className="text-text-secondary">{value}</dd>
    </div>)}</dl>
  </> },
  { id: "calendar", title: "One calendar, preserved results.", body: <p>Weeks start on Monday at 00:00 UTC and end the following Monday. Months use UTC calendar boundaries. Once a competition closes, its results and the evidence behind them are preserved. The archive retains up to the top 100 websites in each device and collection.</p> },
  { id: "history", title: "Historical results keep their history.", body: <><p>Measurements from earlier versions remain available on website reports and in the directory. They do not qualify for the new standardized competitions. The report identifies the method, device, sample count and measurement time so that different kinds of data are not silently combined.</p><p>The directory’s latest recorded mobile score may be older than the current competition. Always check the report date before interpreting it as a website’s present performance.</p></> },
  { id: "change", title: "Your website can change.", body: <p>Outages, redirects and missing badges are tracked as separate states. A temporary network error does not erase past measurements or create a successful test. Scheduled monitoring depends on availability, your plan and the shared provider budget.</p> },
];

export default function Page() {
  return <EditorialPage eyebrow="The measurement standard" title="Speed deserves context." intro="A performance score is a useful signal. Understanding how it was measured makes it a useful comparison." sections={sections} lead={<StandardBoard />}
    next={[
      { href: "/leaderboard", label: "Explore the rankings", note: "Mobile and desktop, ordered with the rules on this page." },
      { href: "/test", label: "Measure your website", note: "Run the current lab test on a public website." },
    ]} />;
}
