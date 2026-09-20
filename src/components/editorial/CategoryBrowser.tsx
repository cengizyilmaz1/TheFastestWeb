"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MagnifyingGlass, X } from "@phosphor-icons/react";
import { categoryPath, type categoryCatalog } from "@/modules/catalog/categories";

type Category = typeof categoryCatalog[number] & { count: number };

export function CategoryBrowser({ categories, available }: { categories: Category[]; available: boolean }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("en-US");
  const matches = categories.filter((category) => `${category.name} ${category.description}`.toLocaleLowerCase("en-US").includes(query));
  return (
    <div>
      <div className="mb-9">
        <label htmlFor="category-search" className="block text-sm font-medium text-text-primary mb-3">Find your category</label>
        <div className="relative max-w-xl">
          <MagnifyingGlass size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
          <input id="category-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search AI, design, marketing..." className="w-full rounded-xl border border-border bg-bg-card py-3 pl-12 pr-12 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 [&::-webkit-search-cancel-button]:appearance-none" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear category search" className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary hover:text-text-primary"><X size={18} aria-hidden="true" /></button>}
        </div>
        <p className="mt-3 text-xs text-text-secondary" role="status">{query ? `${matches.length} ${matches.length === 1 ? "category" : "categories"} found` : `${categories.length} categories to explore`}</p>
      </div>

      {matches.length === 0 && <div className="content-note"><h2 className="font-display text-xl font-semibold mb-2">No matching categories</h2><p className="text-sm text-text-secondary">Try a broader search or clear the filter to explore the full collection.</p><button type="button" onClick={() => setSearch("")} className="content-action-secondary mt-5">Show all categories</button></div>}

      {(["IndieTools categories", "Website types"] as const).map((group) => {
        const entries = matches.filter((category) => category.group === group);
        if (entries.length === 0) return null;
        return <section key={group} className="mb-12" aria-label={group === "IndieTools categories" ? "Browse by interest" : "Browse by website type"}>
          <div className="mb-6">
            <h2 className="font-display text-2xl font-semibold tracking-tight mb-2">{group === "IndieTools categories" ? "Browse by interest" : "Browse by website type"}</h2>
            <p className="text-sm text-text-secondary">{group === "IndieTools categories" ? "Find products and services in the areas you care about." : "Compare websites built for a similar purpose."}</p>
          </div>
          <div className="grid grid-cols-1 min-[620px]:grid-cols-2 gap-4">
            {entries.map((category) => <Link key={category.slug} href={categoryPath(category.slug)} className="group flex flex-col rounded-2xl border border-border bg-bg-card p-6 no-underline transition-colors hover:border-accent/60 hover:bg-bg-card-hover">
              <div className="flex items-start justify-between gap-4 mb-3"><h3 className="font-display text-xl font-semibold tracking-tight text-text-primary group-hover:text-accent transition-colors">{category.name}</h3><ArrowUpRight size={20} className="shrink-0 text-text-secondary group-hover:text-accent transition-colors" aria-hidden="true" /></div>
              <p className="text-text-secondary text-sm leading-7 mb-5">{category.description}</p>
              <span className="text-text-secondary text-xs mt-auto">{available ? <><span className="font-mono text-text-primary">{category.count}</span> public {category.count === 1 ? "website" : "websites"}</> : "Explore category"}</span>
            </Link>)}
          </div>
        </section>;
      })}
    </div>
  );
}
