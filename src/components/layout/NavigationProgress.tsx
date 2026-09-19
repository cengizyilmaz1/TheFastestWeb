"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPath = useRef(pathname + searchParams.toString());

  useEffect(() => {
    const current = pathname + searchParams.toString();

    if (current !== prevPath.current) {
      // Navigation completed — finish the bar
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
      prevPath.current = current;

      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    }
  }, [pathname, searchParams]);

  // Listen for link clicks to start the progress bar
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || anchor.target === "_blank") return;

      const current = pathname + searchParams.toString();
      // Only show progress for actual navigations
      if (href !== current && href !== pathname) {
        setProgress(10);
        setVisible(true);

        if (timer.current) clearInterval(timer.current);
        timer.current = setInterval(() => {
          setProgress((p) => {
            if (p >= 90) return 90;
            return p + (90 - p) * 0.1;
          });
        }, 200);
      }
    }

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      if (timer.current) clearInterval(timer.current);
    };
  }, [pathname, searchParams]);

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
