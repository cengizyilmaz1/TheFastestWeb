"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * The directory's GET filter form. Without JavaScript it submits natively; with it, selects apply on change,
 * empty and default fields stay out of the URL, and the page keeps its scroll position.
 */
export function FilterForm({ action, className, children }: { action: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function apply(form: HTMLFormElement) {
    const search = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value !== "string" || !value.trim() || (key === "sort" && value === "score")) continue;
      search.set(key, value.trim());
    }
    const query = search.toString();
    startTransition(() => router.push(query ? `${action}?${query}` : action, { scroll: false }));
  }
  return <form action={action} role="search" aria-busy={pending} className={className}
    onSubmit={(event) => { event.preventDefault(); apply(event.currentTarget); }}
    onChange={(event) => { if (event.target instanceof HTMLSelectElement) apply(event.currentTarget); }}>{children}</form>;
}
