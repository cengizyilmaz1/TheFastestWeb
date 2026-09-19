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
    desc: "Full donut gauge with glow filter and radial wash behind the arc.",
  },
  {
    id: "speedometer",
    name: "Design 2 — Speedometer",
    desc: "Half-arc meter (car gauge style) with glowing tip dot and gradient bg.",
  },
  {
    id: "scorecard",
    name: "Design 3 — Score Card",
    desc: "Bold large score number with gradient accent strip on left edge.",
  },
];

const SCORES = [97, 75, 42];

export default function BadgePreviewPage() {
  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif", padding: "40px", background: "#09090b", minHeight: "100vh", color: "#f0f0f0" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "4px" }}>Badge Design Preview</h1>
      <p style={{ color: "#6b7280", fontSize: "0.85rem", marginBottom: "40px" }}>Temp page — not indexed. Score shown: {SCORE}. Domain: {DOMAIN}</p>

      {/* Color matrix */}
      <section style={{ marginBottom: "56px" }}>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "16px" }}>Color Matrix</h2>
        <table style={{ borderCollapse: "collapse", fontSize: "0.8rem", fontFamily: "monospace" }}>
          <thead>
            <tr>
              {["Score", "Dark", "Light"].map((h) => (
                <th key={h} style={{ padding: "8px 20px", textAlign: "left", color: "#9ca3af", borderBottom: "1px solid #1e2128", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "≥ 90", dark: "#22c55e", darkName: "green", light: "#22c55e", lightName: "green" },
              { label: "≥ 50", dark: "#f59e0b", darkName: "amber", light: "#f59e0b", lightName: "amber" },
              { label: "< 50", dark: "#ef4444", darkName: "red",   light: "#ef4444", lightName: "red"   },
            ].map((row) => (
              <tr key={row.label} style={{ borderBottom: "1px solid #1e2128" }}>
                <td style={{ padding: "10px 20px", color: "#e5e7eb", fontWeight: 700 }}>{row.label}</td>
                <td style={{ padding: "10px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "18px", height: "18px", borderRadius: "4px", background: row.dark, flexShrink: 0 }}/>
                    <span style={{ color: row.dark, fontWeight: 600 }}>{row.dark}</span>
                    <span style={{ color: "#4b5563" }}>{row.darkName}</span>
                  </div>
                </td>
                <td style={{ padding: "10px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "18px", height: "18px", borderRadius: "4px", background: row.light, flexShrink: 0 }}/>
                    <span style={{ color: row.light, fontWeight: 600 }}>{row.light}</span>
                    <span style={{ color: "#4b5563" }}>{row.lightName}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {VARIANTS.map((v) => (
        <section key={v.id} style={{ marginBottom: "56px" }}>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "4px" }}>{v.name}</h2>
          <p style={{ color: "#6b7280", fontSize: "0.8rem", marginBottom: "24px" }}>{v.desc}</p>

          {/* Dark + Light at main score */}
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginBottom: "20px" }}>
            <div>
              <div style={{ fontSize: "0.7rem", color: "#4b5563", marginBottom: "8px", letterSpacing: "0.05em", textTransform: "uppercase" }}>Dark</div>
              <div style={{ background: "#0a0a0b", padding: "20px", borderRadius: "12px", display: "inline-block" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${BASE}&variant=${v.id}&theme=dark`} width={288} height={80} alt={`${v.name} dark`} style={{ display: "block" }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.7rem", color: "#4b5563", marginBottom: "8px", letterSpacing: "0.05em", textTransform: "uppercase" }}>Light</div>
              <div style={{ background: "#f1f5f9", padding: "20px", borderRadius: "12px", display: "inline-block" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${BASE}&variant=${v.id}&theme=light`} width={288} height={80} alt={`${v.name} light`} style={{ display: "block" }} />
              </div>
            </div>
          </div>

          {/* Score range preview — dark + light */}
          {(["dark", "light"] as const).map((th) => (
            <div key={th} style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "0.7rem", color: "#4b5563", marginBottom: "10px", letterSpacing: "0.05em", textTransform: "uppercase" }}>Score range ({th})</div>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {SCORES.map((s) => (
                  <div key={s} style={{ background: th === "dark" ? "#0a0a0b" : "#f1f5f9", padding: "16px", borderRadius: "10px", display: "inline-block" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/badge/${SLUG}?preview=${s}&domain=${encodeURIComponent(DOMAIN)}&variant=${v.id}&theme=${th}`}
                      width={288} height={80} alt={`score ${s} ${th}`}
                      style={{ display: "block" }}
                    />
                    <div style={{ textAlign: "center", marginTop: "6px", fontSize: "0.7rem", color: "#4b5563" }}>Score: {s}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      {/* Long domain test */}
      <section style={{ marginBottom: "56px" }}>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "4px" }}>Long domain test</h2>
        <p style={{ color: "#6b7280", fontSize: "0.8rem", marginBottom: "24px" }}>Verifying font scaling + truncation on all 3 designs.</p>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {VARIANTS.map((v) => (
            <div key={v.id} style={{ background: "#0a0a0b", padding: "16px", borderRadius: "10px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/badge/${SLUG}?preview=91&domain=${encodeURIComponent("verylongdomainname-example.io")}&variant=${v.id}&theme=dark`}
                width={288} height={80} alt={`${v.id} long domain`}
                style={{ display: "block" }}
              />
              <div style={{ textAlign: "center", marginTop: "6px", fontSize: "0.7rem", color: "#4b5563" }}>{v.id}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
