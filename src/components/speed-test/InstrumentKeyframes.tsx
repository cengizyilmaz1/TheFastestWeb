/** Motion shared by the measuring states. React hoists and de-duplicates the style by its href. Pair every use with `motion-safe:`. */
export function InstrumentKeyframes() {
  return <style href="tfw-instrument-motion" precedence="medium">{
    "@keyframes tfw-breathe { 0%, 100% { opacity: .3; } 50% { opacity: .85; } } " +
    "@keyframes tfw-scan { from { transform: translateX(0); } to { transform: translateX(100%); } }"
  }</style>;
}

/** A placeholder bar that stands in for a value that is still being measured. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <span aria-hidden className={"block rounded-full bg-border-light opacity-60 motion-safe:animate-[tfw-breathe_1.5s_ease-in-out_infinite] " + className} />;
}
