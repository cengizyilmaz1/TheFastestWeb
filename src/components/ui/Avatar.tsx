"use client";

import { useCallback, useState } from "react";

interface AvatarProps {
  name: string;
  src?: string | null;
  fallbackSrc?: string | null;
  className?: string;
  size?: number;
}

/** Public callers pass the published founder image, never private account data. */
export function Avatar({ name, src, fallbackSrc, className = "", size = 24 }: AvatarProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const image = [src, fallbackSrc].find((value) => value && !failedSources.includes(value));
  const rejectImage = useCallback(() => {
    if (image) setFailedSources((previous) => previous.includes(image) ? previous : [...previous, image]);
  }, [image]);
  const checkInitialImage = useCallback((element: HTMLImageElement | null) => {
    // The server-rendered request can fail before React attaches its error handler.
    if (element?.complete && element.naturalWidth === 0) rejectImage();
  }, [rejectImage]);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase();

  if (!image) {
    return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-elevated text-[10px] font-bold text-text-muted ${className}`} style={{ width: size, height: size }}>
      {initials || <svg viewBox="0 0 24 24" className="h-3/5 w-3/5" fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3H4Z" /></svg>}
    </span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={checkInitialImage} src={image} alt="" width={size} height={size}
      className={`shrink-0 rounded-full object-cover ${className}`} loading="lazy" fetchPriority="low" referrerPolicy="no-referrer"
      onError={rejectImage} />
  );
}
