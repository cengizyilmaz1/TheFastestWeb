import { countryName, isCountryCode } from "@/modules/catalog/countries";

/** Same-origin SVGs also render as flags on Windows, unlike flag emoji. */
export function CountryFlag({ code, decorative = false }: { code: string | null | undefined; decorative?: boolean }) {
  const normalized = code?.trim().toUpperCase();
  if (!normalized || !isCountryCode(normalized)) return null;
  return (
    // A 20px SVG does not benefit from rasterization or image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/flags/${normalized.toLowerCase()}.svg`} width={20} height={15}
      alt={decorative ? "" : `${countryName(normalized)} flag`} aria-hidden={decorative || undefined}
      loading="lazy" className="inline-block h-[15px] w-5 shrink-0 rounded-[2px] object-cover" />
  );
}
