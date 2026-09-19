import type { ReactNode } from "react";
export function EditorialPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return <article className="page-shell mx-auto max-w-[800px]"><p className="page-eyebrow mb-5">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="page-description mt-6 text-lg">{intro}</p><div className="editorial-body mt-12 space-y-10">{children}</div></article>;
}
