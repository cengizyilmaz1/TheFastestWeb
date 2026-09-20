"use client";

import { useState, useCallback, useSyncExternalStore } from "react";

interface FaviconImgProps {
  url: string;
  src?: string;
  alt?: string;
  className?: string;
}

export function FaviconImg({ url, src: initialSrc, alt = "", className = "" }: FaviconImgProps) {
  const [fallbackLevel, setFallbackLevel] = useState(0);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch {
    // invalid url
  }

  // Use Google's faviconV2 which returns 404 on miss (triggering onError),
  // unlike s2/favicons which returns a generic globe on miss.
  const googleApi = `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`;

  const sources = [
    initialSrc || googleApi,
    ...(initialSrc ? [googleApi] : []),
    domain ? `https://${domain}/favicon.ico` : null,
  ].filter(Boolean) as string[];

  const handleError = useCallback(() => {
    setFallbackLevel((prev) => prev + 1);
  }, []);

  const currentSrc = sources[fallbackLevel];
  const letter = domain ? domain.replace("www.", "").charAt(0).toUpperCase() : "?";
  const letterPlaceholder = (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#2A2725",
        color: "#9C9590",
        fontWeight: 700,
        fontSize: "1rem",
        borderRadius: "6px",
      }}
    >
      {letter}
    </div>
  );

  if (!mounted || !currentSrc || !domain) {
    return letterPlaceholder;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={handleError}
      loading="lazy"
      fetchPriority="low"
    />
  );
}
