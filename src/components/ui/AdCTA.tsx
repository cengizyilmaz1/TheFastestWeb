import { MegaphoneSimpleIcon } from "@phosphor-icons/react/dist/ssr";

/** Placeholder for an unsold sponsor slot. Dashed and secondary, like the sponsorship prompt in the sidebar. */
export function AdCTA() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col justify-center rounded-2xl border border-dashed border-border-light p-3.5">
      <MegaphoneSimpleIcon size={20} className="text-text-muted" aria-hidden />
      <p className="mt-3 text-[13px] font-semibold leading-tight text-text-secondary">Advertising</p>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">New placements are temporarily unavailable.</p>
    </div>
  );
}
