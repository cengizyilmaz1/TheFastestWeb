import type { CSSProperties } from "react";
import { MetricInfoTip } from "@/components/ui/MetricInfoTip";
import { BAND_DOT, BAND_LABEL, BAND_TONE, METRIC_SPECS, formatDuration, formatThreshold, isMeasured, metricBand, metricPosition, type MetricKey } from "./metric-bands";

type Reading = number | null | undefined;
interface MetricsGridProps {
  caption: string;
  metrics: Record<MetricKey, Reading>;
  /** A recorded value that has no threshold bands, shown as the closing row. */
  loadTimeMs?: Reading;
}

const order: MetricKey[] = ["lcpMs", "cls", "tbtMs", "fcpMs", "siMs", "ttiMs"];

function display(key: MetricKey, value: Reading) {
  if (!isMeasured(value)) return { value: "—", unit: "" };
  return METRIC_SPECS[key].time ? formatDuration(value) : { value: value.toFixed(3), unit: "" };
}

/** The spec sheet of a measurement: each lab metric on its own threshold rule, the way the score sits on the 0-100 rule. */
export function MetricsGrid({ caption, metrics, loadTimeMs }: MetricsGridProps) {
  const load = formatDuration(isMeasured(loadTimeMs) ? loadTimeMs : null);
  return <table className="w-full table-fixed border-collapse text-left">
    <caption className="sr-only">{caption}</caption>
    <colgroup><col /><col className="hidden w-[46%] md:table-column" /><col className="w-28 sm:w-40" /></colgroup>
    <thead className="border-b border-border-light text-xs text-text-muted"><tr>
      <th scope="col" className="py-3 pr-4 font-medium">Metric</th>
      <th scope="col" className="hidden px-6 py-3 font-medium md:table-cell lg:px-10"><span className="sr-only">Threshold bands</span><span aria-hidden className="flex"><span className="w-[40%]">Good</span><span className="w-[30%]">Needs work</span><span className="w-[30%]">Poor</span></span></th>
      <th scope="col" className="py-3 text-right font-medium">Result</th>
    </tr></thead>
    <tbody>
      {order.map((key) => {
        const spec = METRIC_SPECS[key], value = metrics[key], band = metricBand(key, value), shown = display(key, value);
        return <tr key={key} className="border-b border-border transition-colors hover:bg-bg-main">
          <th scope="row" className="py-5 pr-4 align-middle font-normal">
            <span className="flex items-center gap-2"><span className="text-[15px] font-semibold leading-snug text-text-primary">{spec.label}</span><MetricInfoTip metric={spec.info} /></span>
            <span className="mt-1 block text-[13px] text-text-muted">Good up to <span className="text-text-secondary">{formatThreshold(key, spec.good)}</span></span>
          </th>
          <td className="hidden px-6 py-5 align-middle md:table-cell lg:px-10"><span aria-hidden className="relative block pt-1">
            <span className="score-ticks h-4" data-band={band ?? "good"} style={{ "--score": isMeasured(value) ? metricPosition(key, value) : 0 } as CSSProperties} />
            <span className="absolute left-[40%] top-0 h-6 w-px bg-text-muted" /><span className="absolute left-[70%] top-0 h-6 w-px bg-text-muted" />
            {isMeasured(value) && <span className="absolute top-0 h-6 w-[3px] -translate-x-1/2 -skew-x-[18deg] rounded-sm bg-text-primary" style={{ left: metricPosition(key, value) + "%" }} />}
            <span className="stat-value relative mt-2.5 block h-3.5 text-[11px] leading-none text-text-muted"><span className="absolute left-[40%] -translate-x-1/2 whitespace-nowrap">{formatThreshold(key, spec.good)}</span><span className="absolute left-[70%] -translate-x-1/2 whitespace-nowrap">{formatThreshold(key, spec.poor)}</span></span>
          </span></td>
          <td className="py-5 text-right align-middle">
            <span className={"stat-value text-2xl font-medium sm:text-[1.75rem] " + (band ? BAND_TONE[band] : "text-text-muted")}>{shown.value}{shown.unit && <span className="ml-1 text-sm font-normal text-text-muted">{shown.unit}</span>}</span>
            <span className="mt-1 flex items-center justify-end gap-1.5 text-xs text-text-secondary">{band ? <><span aria-hidden className={"h-1.5 w-1.5 rounded-full " + BAND_DOT[band]} />{BAND_LABEL[band]}</> : "Not recorded"}</span>
          </td>
        </tr>;
      })}
      <tr className="border-b border-border transition-colors hover:bg-bg-main">
        <th scope="row" className="py-5 pr-4 align-middle font-normal"><span className="block text-[15px] font-semibold leading-snug text-text-primary">Recorded load estimate</span><span className="mt-1 block text-[13px] text-text-muted">Stored with the result. No bands apply.</span></th>
        <td className="hidden md:table-cell" />
        <td className="py-5 text-right align-middle"><span className={"stat-value text-2xl font-medium sm:text-[1.75rem] " + (load.unit ? "text-text-primary" : "text-text-muted")}>{load.value}{load.unit && <span className="ml-1 text-sm font-normal text-text-muted">{load.unit}</span>}</span></td>
      </tr>
    </tbody>
  </table>;
}
