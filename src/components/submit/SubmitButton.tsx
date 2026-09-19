import Link from "next/link";

export function SubmitButton() {
  return (
    <Link
      href="/submit"
      className="px-4 py-[7px] rounded-lg text-[0.875rem] font-semibold text-bg-deep bg-gradient-to-br from-accent to-accent-bright border-none cursor-pointer font-body transition-all duration-200 shadow-[0_0_20px_var(--color-accent-glow)] hover:-translate-y-px hover:shadow-[0_0_30px_rgba(245,158,11,0.25)] no-underline"
    >
      Submit Site
    </Link>
  );
}
