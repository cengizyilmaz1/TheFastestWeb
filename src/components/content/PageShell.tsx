import type { ReactNode } from "react";

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`content-page ${className}`}>{children}</div>;
}

export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return <header className="content-header">
    {eyebrow && <p className="content-eyebrow">{eyebrow}</p>}
    <h1 className="content-title">{title}</h1>
    {description && <div className="content-intro">{description}</div>}
    {children}
  </header>;
}

export function SectionHeading({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return <div className="mb-6"><h2 className="font-display text-[clamp(1.45rem,2.5vw,2rem)] font-semibold tracking-[-0.025em] text-text-primary">{title}</h2>{description && <p className="content-intro mt-2">{description}</p>}</div>;
}
