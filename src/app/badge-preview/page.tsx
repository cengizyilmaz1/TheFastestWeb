import Image from "next/image";
import { notFound } from "next/navigation";
/**
 * Temp badge design preview page — not linked anywhere, not indexed.
 * Visit: /badge-preview
 */
export const metadata = { robots: "noindex" };

const SCORE = 87;
const DOMAIN = "dodopayments.com";
const SLUG = "preview-test";

const BASE = `/api/badge/${SLUG}?preview=${SCORE}&domain=${encodeURIComponent(DOMAIN)}`;

const VARIANTS = [
  {
    id: "glow",
    name: "Design 1 — Glow Donut",
    title: "Glow donut",
    desc: "Full donut gauge with glow filter and radial wash behind the arc.",
  },
  {
    id: "speedometer",
    name: "Design 2 — Speedometer",
    title: "Speedometer",
    desc: "Half-arc meter (car gauge style) with glowing tip dot and gradient bg.",
  },
  {
    id: "scorecard",
    name: "Design 3 — Score Card",
    title: "Score card",
    desc: "Bold large score number with gradient accent strip on left edge.",
  },
];

const SCORES = [97, 75, 42];
const BANDS = [
  { label: "90 and above", name: "Green", sample: 97, dot: "bg-green", tone: "text-green" },
  { label: "50 to 89", name: "Amber", sample: 75, dot: "bg-orange", tone: "text-orange" },
  { label: "Below 50", name: "Red", sample: 42, dot: "bg-red", tone: "text-red" },
];
const THEMES = ["dark", "light"] as const;

/** A badge on the page background it will meet in the wild. The stage pins its own theme so both can sit side by side. */
function Stage({ theme, children }: { theme: (typeof THEMES)[number]; children: React.ReactNode }) {
  return <div data-theme={theme} className="min-w-0 rounded-2xl border border-border bg-bg-deep p-5 text-text-primary sm:p-7">
    <p className="mb-5 flex items-center gap-2 text-[13px] font-medium text-text-secondary"><span aria-hidden className="h-2 w-2 rounded-full border border-border-light bg-text-primary" />{theme === "dark" ? "Dark page" : "Light page"}</p>
    {children}
  </div>;
}

export default function BadgePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="page-shell mx-auto max-w-[1240px]">
      <p className="page-eyebrow mb-5">Internal preview, not indexed</p>
      <h1 className="page-title">Badge design preview</h1>
      <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-4 text-[13px]">
        <div><dt className="text-text-muted">Score shown</dt><dd className="stat-value mt-1 text-2xl font-medium text-text-primary">{SCORE}</dd></div>
        <div><dt className="text-text-muted">Domain</dt><dd className="mt-1 text-2xl font-semibold tracking-[-.03em] text-text-primary">{DOMAIN}</dd></div>
        <div><dt className="text-text-muted">Designs</dt><dd className="stat-value mt-1 text-2xl font-medium text-text-primary">{VARIANTS.length}</dd></div>
      </dl>

      <section className="mt-16 grid gap-x-16 gap-y-8 sm:mt-20 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div><h2 className="section-title">Color matrix</h2><p className="mt-4 max-w-[44ch] leading-relaxed text-text-secondary">The arc color follows the score band. Dark and light badges use the same band colors.</p></div>
        <table className="w-full table-fixed border-collapse self-start text-left text-sm">
          <caption className="sr-only">Badge color by score band</caption>
          <thead className="border-b border-border-light text-xs text-text-muted"><tr><th scope="col" className="py-3 pr-3 font-medium">Score</th><th scope="col" className="px-3 py-3 font-medium">Dark</th><th scope="col" className="px-3 py-3 font-medium">Light</th><th scope="col" className="py-3 pl-3 text-right font-medium">Sample</th></tr></thead>
          <tbody>{BANDS.map((band) => <tr key={band.label} className="border-b border-border">
            <th scope="row" className="py-4 pr-3 font-semibold text-text-primary">{band.label}</th>
            {THEMES.map((theme) => <td key={theme} className="px-3 py-4 text-text-secondary"><span className="inline-flex items-center gap-2.5"><span aria-hidden className={"h-2.5 w-2.5 rounded-full " + band.dot} />{band.name}</span></td>)}
            <td className={"stat-value py-4 pl-3 text-right text-lg font-medium " + band.tone}>{band.sample}</td>
          </tr>)}</tbody>
        </table>
      </section>

      {VARIANTS.map((v, index) => (
        <section key={v.id} className="mt-20 sm:mt-28">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
            <div><p className="stat-value mb-3 text-xs text-text-muted">{String(index + 1).padStart(2, "0")}</p><h2 className="section-title">{v.title}</h2></div>
            <p className="max-w-[48ch] text-[15px] leading-relaxed text-text-secondary">{v.desc}</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {THEMES.map((th) => (
              <Stage key={th} theme={th}>
                {/* Main score first, then the score range. */}
                <ul className="grid gap-x-6 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
                  <li className="min-w-0">
                    <Image unoptimized src={`${BASE}&variant=${v.id}&theme=${th}`} width={288} height={80} alt={`${v.name} ${th}`} className="block h-auto max-w-full" />
                    <p className="mt-2.5 text-xs text-text-muted">Score <span className="stat-value text-text-secondary">{SCORE}</span></p>
                  </li>
                  {SCORES.map((s) => (
                    <li key={s} className="min-w-0">
                      <Image unoptimized
                        src={`/api/badge/${SLUG}?preview=${s}&domain=${encodeURIComponent(DOMAIN)}&variant=${v.id}&theme=${th}`}
                        width={288} height={80} alt={`score ${s} ${th}`}
                        className="block h-auto max-w-full"
                      />
                      <p className="mt-2.5 text-xs text-text-muted">Score <span className="stat-value text-text-secondary">{s}</span></p>
                    </li>
                  ))}
                </ul>
              </Stage>
            ))}
          </div>
        </section>
      ))}

      {/* Long domain test */}
      <section className="mt-20 sm:mt-28">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
          <h2 className="section-title">Long domain test</h2>
          <p className="max-w-[48ch] text-[15px] leading-relaxed text-text-secondary">Verifying font scaling and truncation on all 3 designs.</p>
        </div>
        <Stage theme="dark">
          <ul className="grid gap-x-6 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
            {VARIANTS.map((v) => (
              <li key={v.id} className="min-w-0">
                <Image unoptimized
                  src={`/api/badge/${SLUG}?preview=91&domain=${encodeURIComponent("verylongdomainname-example.io")}&variant=${v.id}&theme=dark`}
                  width={288} height={80} alt={`${v.id} long domain`}
                  className="block h-auto max-w-full"
                />
                <p className="mt-2.5 text-xs text-text-muted">{v.title}</p>
              </li>
            ))}
          </ul>
        </Stage>
      </section>
    </div>
  );
}
