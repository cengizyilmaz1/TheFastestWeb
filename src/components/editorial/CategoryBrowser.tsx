"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MagnifyingGlass, X } from "@phosphor-icons/react";
import { categoryPath, type categoryCatalog } from "@/modules/catalog/categories";

type Category = typeof categoryCatalog[number] & { count: number };

export function CategoryBrowser({ categories, available }: { categories: Category[]; available: boolean }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("en-US");
  // One alphabetical list; the catch-all category closes it.
  const ordered = [...categories].sort((a, b) => Number(a.slug === "other") - Number(b.slug === "other") || a.name.localeCompare(b.name, "en-US"));
  const matches = ordered.filter((category) => `${category.name} ${category.description}`.toLocaleLowerCase("en-US").includes(query));
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[320px] max-w-xl">
          <label htmlFor="category-search" className="block text-sm font-medium text-text-primary mb-3">Find your category</label>
          <div className="relative">
            <MagnifyingGlass size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
            <input id="category-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search AI, design, marketing..." className="w-full rounded-xl border border-border bg-bg-card py-3 pl-12 pr-12 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 [&::-webkit-search-cancel-button]:appearance-none" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear category search" className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary hover:text-text-primary"><X size={18} aria-hidden="true" /></button>}
          </div>
        </div>
        <p className="pb-3 text-xs text-text-secondary" role="status">{query ? `${matches.length} ${matches.length === 1 ? "category" : "categories"} found` : `${categories.length} categories to explore`}</p>
      </div>

      {matches.length === 0 && <div className="content-note mb-12"><h2 className="font-display text-xl font-semibold mb-2">No matching categories</h2><p className="text-sm text-text-secondary">Try a broader search or clear the filter to explore the full collection.</p><button type="button" onClick={() => setSearch("")} className="content-action-secondary mt-5">Show all categories</button></div>}

      {matches.length > 0 && <ul aria-label="Website categories" className="mb-12 grid grid-cols-1 gap-3 min-[620px]:grid-cols-2 min-[1500px]:grid-cols-3">
        {matches.map((category) => <li key={category.slug} className="min-w-0">
          <Link href={categoryPath(category.slug)} className="group flex h-full flex-col rounded-2xl border border-border bg-bg-card p-5 no-underline transition-colors hover:border-accent/60 hover:bg-bg-card-hover">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary transition-colors group-hover:text-accent">{category.name}</h2>
              <span className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
                {available && <span className="rounded-md border border-border px-2 py-0.5"><span className="font-mono text-text-primary">{category.count}</span> {category.count === 1 ? "website" : "websites"}</span>}
                <ArrowUpRight size={18} className="transition-colors group-hover:text-accent" aria-hidden="true" />
              </span>
            </div>
            <p className="text-sm leading-6 text-text-secondary">{category.description}</p>
          </Link>
        </li>)}
      </ul>}
    </div>
  );
}
