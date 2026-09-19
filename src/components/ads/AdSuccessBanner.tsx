"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export function AdSuccessBanner() {
  const searchParams = useSearchParams();
  const isAdSuccess = searchParams.get("ad_success") === "1";
  const [show, setShow] = useState(isAdSuccess);

  if (!show) return null;

  return (
    <div className="max-w-[700px] mx-auto px-5 pt-4">
      <div className="bg-gradient-to-r from-[rgba(34,197,94,0.12)] to-[rgba(34,197,94,0.04)] border border-green/30 rounded-[12px] px-4 py-3.5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-green/20 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-green text-lg font-bold">&#10003;</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-[0.95rem] text-text-primary">
            Your ad is being set up!
          </div>
          <p className="text-[0.78rem] text-text-secondary mt-0.5">
            Once payment is confirmed, your ad will appear in the sidebar on
            every page. This usually takes a few seconds.
          </p>
        </div>
        <button
          onClick={() => setShow(false)}
          className="text-text-muted hover:text-text-primary transition-colors text-lg leading-none border-none bg-transparent cursor-pointer p-1"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}
