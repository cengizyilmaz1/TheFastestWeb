import Image from "next/image";
import { monogram } from "@/components/directory/WebsiteList";

const sizes = {
  md: { box: "h-14 w-14 rounded-[18px] text-xl", pixels: 56 },
  lg: { box: "h-24 w-24 rounded-[28px] text-4xl sm:h-32 sm:w-32 sm:rounded-[36px] sm:text-5xl", pixels: 128 },
};

/** A squircle portrait. Without a picture it falls back to the same letter tile the directory uses for websites. */
export function FounderAvatar({ name, avatarUrl, size = "md", className = "" }: { name: string; avatarUrl?: string | null; size?: keyof typeof sizes; className?: string }) {
  const { box, pixels } = sizes[size];
  if (avatarUrl) return <Image unoptimized src={avatarUrl} alt="" width={pixels} height={pixels} className={`flex-none border border-border bg-bg-card object-cover ${box} ${className}`} />;
  return <span aria-hidden className={`inline-flex flex-none items-center justify-center bg-bg-card font-bold text-text-primary border border-border font-stretch-[120%] ${box} ${className}`}>{monogram(name)}</span>;
}

/** "TR" reads better as "Türkiye". Unknown codes fall back to the code itself. */
export function countryName(code: string | null | undefined) {
  if (!code) return null;
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code; } catch { return code; }
}
