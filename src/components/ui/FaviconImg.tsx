"use client";

import { useState, useCallback } from "react";
import Image from "next/image";

interface FaviconImgProps {
  url: string;
  src?: string;
  alt?: string;
  className?: string;
}

export function FaviconImg({ url, src: initialSrc, alt = "", className = "" }: FaviconImgProps) {
  const [fallbackLevel, setFallbackLevel] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

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
  // The shared letter tile. Utilities passed by the caller (size, radius) win over the .monogram defaults.
  const letterPlaceholder = (
    <span aria-hidden={alt ? undefined : true} role={alt ? "img" : undefined} aria-label={alt || undefined} className={"monogram " + className}>
      {letter}
    </span>
  );

  if (!currentSrc || !domain) {
    return letterPlaceholder;
  }

  return (
    <span role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} className={"monogram relative overflow-hidden " + className}>
    <span aria-hidden>{loadedSrc === currentSrc ? "" : letter}</span>
    <Image
      unoptimized
      width={64}
      height={64}
      src={currentSrc}
      alt=""
      className={"absolute inset-0 h-full w-full object-contain transition-opacity " + (loadedSrc === currentSrc ? "opacity-100" : "opacity-0")}
      onError={handleError}
      onLoad={() => setLoadedSrc(currentSrc)}
      loading="lazy"
      fetchPriority="low"
    />
    </span>
  );
}
