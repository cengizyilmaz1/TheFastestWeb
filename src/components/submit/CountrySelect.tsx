"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { countryName, filterCountryOptions, listCountryOptions } from "@/modules/catalog/countries";

/** Searchable ISO country picker, with locally served flags as on IndieTools. */
export function CountrySelect({ id, value, onChange, disabled = false, error }: {
  id: string;
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => listCountryOptions(), []);
  const matches = useMemo(() => filterCountryOptions(options, query), [options, query]);
  const listId = `${id}-options`;
  const labelId = `${id}-label`;
  const active = matches[activeIndex];

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function outside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (open && active) document.getElementById(`${id}-option-${active.code}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id, open]);

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function showOptions() {
    setQuery("");
    setActiveIndex(Math.max(0, options.findIndex((option) => option.code === value)));
    setOpen(true);
  }

  return (
    <div ref={rootRef} className="relative mb-3.5 min-w-0" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <label id={labelId} htmlFor={id} className="mb-1 block text-[0.75rem] font-semibold text-text-secondary">
        Country of origin <span className="font-normal text-text-secondary">(required)</span>
      </label>
      <input type="hidden" name="countryCode" value={value ?? ""} />
      <button ref={buttonRef} id={id} type="button" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${id}-value`} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
        onClick={() => open ? setOpen(false) : showOptions()}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); showOptions(); }
        }}
        className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border bg-bg-card px-3 py-2.5 text-left text-[0.82rem] text-text-primary outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50 ${error ? "border-red" : "border-border hover:border-border-light"}`}>
        <span id={`${id}-value`} className="flex min-w-0 items-center gap-2.5">
          {value && <CountryFlag code={value} decorative />}
          <span className={`truncate ${!value ? "text-text-secondary" : ""}`}>{value ? countryName(value) : "Choose a country"}</span>
        </span>
        <CaretDownIcon size={14} aria-hidden className="shrink-0 text-text-muted" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-border-light bg-bg-main shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <MagnifyingGlassIcon size={16} aria-hidden className="shrink-0 text-text-muted" />
            <input ref={searchRef} type="text" role="combobox" autoComplete="off" spellCheck={false}
              aria-label="Search countries" aria-autocomplete="list" aria-expanded="true" aria-controls={listId}
              aria-activedescendant={active ? `${id}-option-${active.code}` : undefined} aria-required="true"
              aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
              value={query} placeholder="Search by country or code…"
              className="min-w-0 flex-1 bg-transparent py-3 text-[0.82rem] text-text-primary outline-none placeholder:text-text-secondary"
              onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); buttonRef.current?.focus(); }
                else if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, matches.length - 1)); }
                else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
                else if (event.key === "Enter") { event.preventDefault(); if (active) choose(active.code); }
              }} />
          </div>
          <ul id={listId} role="listbox" tabIndex={-1} aria-labelledby={labelId} className="max-h-56 overflow-y-auto overscroll-contain p-1">
            {matches.map((option, index) => (
              <li id={`${id}-option-${option.code}`} key={option.code} role="option" aria-selected={value === option.code}
                onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.code)}
                onPointerMove={() => setActiveIndex(index)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8rem] ${activeIndex === index ? "bg-bg-elevated text-text-primary" : "text-text-secondary"}`}>
                <CountryFlag code={option.code} decorative />
                <span className="min-w-0 flex-1 break-words">{option.name}</span>
                <span className="text-[0.65rem] text-text-secondary">{option.code}</span>
                {value === option.code && <CheckIcon size={14} aria-hidden className="shrink-0 text-accent" />}
              </li>
            ))}
          </ul>
          {!matches.length && <p role="status" className="px-3 py-4 text-[0.8rem] text-text-secondary">No country matches. Try its name or two-letter code.</p>}
        </div>
      )}
      <p id={`${id}-help`} className="mt-1.5 text-[0.68rem] leading-relaxed text-text-secondary">Where your product is based. This is not your hosting location or citizenship.</p>
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-[0.72rem] text-red">{error}</p>}
    </div>
  );
}
