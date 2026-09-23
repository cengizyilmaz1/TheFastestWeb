"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SiteMetadata } from "@/modules/sites/metadata";
import { createAutofillSession, listingSuggestions, type AutofillField } from "./autofill";
import { readWebsiteMetadata } from "./submission-client";

export function useListingAutofill(setters: {
  name: (value: string) => void; description: (value: string) => void;
  category: (value: string) => void; faviconUrl?: (value: string) => void;
}, initialCategory = false) {
  const session = useRef(createAutofillSession(initialCategory ? ["category"] : []));
  const controller = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const { name, description, category, faviconUrl } = setters;
  const fill = useCallback((metadata: Partial<SiteMetadata> | null, url: string, request: number) => {
    const values = listingSuggestions(metadata, url);
    const apply = { name, description, category, faviconUrl };
    for (const field of Object.keys(values) as AutofillField[]) {
      if (session.current.canFill(request, field)) apply[field]?.(values[field]!);
    }
  }, [name, description, category, faviconUrl]);
  const populate = useCallback((metadata: Partial<SiteMetadata> | null, url: string) => {
    controller.current?.abort();
    fill(metadata, url, session.current.start());
    setLoading(false);
    setNotice("Website details filled where available. Review them and choose your country of origin.");
  }, [fill]);
  const refresh = useCallback(async (url: string) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const request = session.current.start();
    setLoading(true);
    setNotice("");
    try {
      const metadata = await readWebsiteMetadata(url, abort.signal);
      if (!session.current.current(request)) return;
      fill(metadata, url, request);
      setNotice("Website details filled where available. Your edits have been kept.");
    } catch {
      if (session.current.current(request)) setNotice("Website details could not be loaded. You can enter them manually.");
    } finally {
      if (session.current.current(request)) setLoading(false);
    }
  }, [fill]);
  const reset = useCallback(() => {
    controller.current?.abort(); session.current.reset(); setLoading(false); setNotice("");
  }, []);
  useEffect(() => {
    const current = session.current;
    return () => { current.cancel(); controller.current?.abort(); };
  }, []);
  return { populate, refresh, reset, loading, notice, edit: (field: AutofillField) => session.current.edit(field) };
}
