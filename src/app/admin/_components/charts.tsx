import type { DayPoint } from "@/modules/admin/dashboard";
import { formatCount } from "./ui";

const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const label = (day: string) => dayLabel.format(new Date(`${day}T00:00:00Z`));

/** One series, one hue. Columns grow from a shared baseline; the value for a
 * day appears on hover, and the same data is a table for assistive tech. */
export function DailyColumns({ data, caption, format = formatCount }: { data: DayPoint[]; caption: string; format?: (value: number) => string }) {
  const max = Math.max(1, ...data.map((point) => point.value));
  const total = data.reduce((sum, point) => sum + point.value, 0);
  if (!total) return <p className="flex h-[196px] items-center justify-center px-5 text-center text-[0.82rem] text-text-secondary">Nothing recorded in the last {data.length} days.</p>;
  return <figure className="px-5 pb-5 pt-4">
    <div aria-hidden="true">
      <div className="flex items-center justify-between text-[0.68rem] text-text-secondary"><span className="font-mono">{format(max)}</span><span>peak day</span></div>
      <div className="mt-1.5 flex h-[132px] items-end gap-[2px] border-b border-t border-border border-t-border/50">
        {data.map((point, index) => <div key={point.day} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
          <div className={`w-full max-w-[24px] rounded-t-[4px] transition-colors ${point.value ? "bg-accent group-hover:bg-accent-bright" : "bg-border"}`}
            style={{ height: point.value ? `max(3px, ${(point.value / max) * 100}%)` : "1px" }} />
          <div className={`pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md border border-border-light bg-bg-elevated px-2 py-1 text-[0.7rem] text-text-secondary opacity-0 shadow-lg group-hover:opacity-100 ${
            index < 4 ? "left-0" : index > data.length - 5 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
            <span className="font-mono font-semibold text-text-primary">{format(point.value)}</span> · {label(point.day)}</div>
        </div>)}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.68rem] text-text-secondary"><span>{label(data[0].day)}</span><span>{label(data[Math.floor(data.length / 2)].day)}</span><span>{label(data[data.length - 1].day)}</span></div>
    </div>
    <table className="sr-only"><caption>{caption}. Total {format(total)}.</caption>
      <thead><tr><th scope="col">Day</th><th scope="col">Value</th></tr></thead>
      <tbody>{data.map((point) => <tr key={point.day}><th scope="row">{label(point.day)}</th><td>{format(point.value)}</td></tr>)}</tbody></table>
  </figure>;
}

/** Magnitude by class: horizontal bars in one hue, each labelled with its value. */
export function BarList({ items, empty, labelWidth = 92 }: { items: { label: string; value: number }[]; empty: string; labelWidth?: number }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (!items.length) return <p className="px-5 py-8 text-center text-[0.82rem] text-text-secondary">{empty}</p>;
  return <ul className="space-y-3 px-5 py-4">
    {items.map((item) => <li key={item.label} className="grid items-center gap-3 text-[0.78rem]" style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr) 44px` }}>
      <span className="truncate capitalize text-text-secondary" title={item.label}>{item.label}</span>
      <span aria-hidden="true" className="block h-2.5"><span className="block h-full min-w-[3px] rounded-r-[4px] bg-accent" style={{ width: `${(item.value / max) * 100}%` }} /></span>
      <span className="text-right font-mono font-semibold text-text-primary">{formatCount(item.value)}</span>
    </li>)}
  </ul>;
}

/** Score bands are states, so they use the reserved status colors with a label and a count. */
export function ScoreBands({ fast, average, slow }: { fast: number; average: number; slow: number }) {
  const total = fast + average + slow;
  const bands = [{ label: "Fast", range: "90 to 100", value: fast, fill: "bg-green" }, { label: "Average", range: "50 to 89", value: average, fill: "bg-orange" },
    { label: "Slow", range: "below 50", value: slow, fill: "bg-red" }];
  if (!total) return <p className="px-5 py-8 text-center text-[0.82rem] text-text-secondary">No listed websites have a recorded score yet.</p>;
  return <div className="px-5 py-4">
    <div aria-hidden="true" className="flex h-3 gap-[2px] overflow-hidden rounded-[4px]">
      {bands.filter((band) => band.value).map((band) => <span key={band.label} className={`block h-full ${band.fill}`} style={{ width: `${(band.value / total) * 100}%` }} />)}
    </div>
    <dl className="mt-4 grid grid-cols-3 gap-3">
      {bands.map((band) => <div key={band.label} className="min-w-0">
        <dt className="flex items-center gap-2 text-[0.76rem] text-text-secondary"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${band.fill}`} />{band.label}</dt>
        <dd className="mt-1"><span className="font-mono text-[1.05rem] font-semibold text-text-primary">{formatCount(band.value)}</span>
          <span className="ml-1.5 text-[0.72rem] text-text-secondary">{Math.round((band.value / total) * 100)}%</span>
          <span className="block text-[0.7rem] text-text-secondary">{band.range}</span></dd>
      </div>)}
    </dl>
  </div>;
}
