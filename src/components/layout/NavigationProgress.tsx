"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRoute = `${pathname}?${searchParams.toString()}`;
  // Route completion remounts the indicator and clears its timers naturally.
  return <NavigationProgressIndicator key={currentRoute} />;
}

function NavigationProgressIndicator() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for link clicks to start the progress bar
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target instanceof Element) || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const anchor = e.target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(href, window.location.href);
      const current = window.location;
      if (destination.origin !== current.origin) return;
      if (`${destination.pathname}${destination.search}` !== `${current.pathname}${current.search}`) {
        setProgress(10);
        setVisible(true);

        if (timer.current) clearInterval(timer.current);
        if (deadline.current) clearTimeout(deadline.current);
        timer.current = setInterval(() => {
          setProgress((p) => {
            if (p >= 90) return 90;
            return p + (90 - p) * 0.1;
          });
        }, 200);
        deadline.current = setTimeout(() => {
          if (timer.current) clearInterval(timer.current);
          setVisible(false);
          setProgress(0);
        }, 15_000);
      }
    }

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      if (timer.current) clearInterval(timer.current);
      if (deadline.current) clearTimeout(deadline.current);
    };
  }, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] h-[2px] pointer-events-none"
      style={{ opacity: visible || progress === 100 ? 1 : 0 }}
    >
      <div
        className="h-full bg-gradient-to-r from-accent to-accent-bright shadow-[0_0_10px_var(--color-accent-glow)]"
        style={{
          width: `${progress}%`,
          transition: progress === 100
            ? "width 200ms ease-out, opacity 300ms ease 200ms"
            : "width 400ms ease-out",
        }}
      />
    </div>
  );
}
