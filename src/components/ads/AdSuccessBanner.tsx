"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircleIcon, XIcon } from "@phosphor-icons/react";

export function AdSuccessBanner() {
  const searchParams = useSearchParams();
  const isAdSuccess = searchParams.get("ad_success") === "1";
  const [show, setShow] = useState(isAdSuccess);

  if (!show) return null;

  return (
    <div className="mx-auto max-w-[1240px] px-5 pt-6 sm:px-8">
      <div role="status" className="panel flex items-start gap-3.5 py-3 pl-5 pr-2 sm:items-center">
        <CheckCircleIcon size={24} weight="fill" className="mt-2.5 flex-none text-green sm:mt-0" aria-hidden />
        <div className="min-w-0 flex-1 py-2">
          <p className="text-[15px] font-semibold leading-snug text-text-primary">
            Your ad is being set up.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            Once payment is confirmed, your ad will appear in the sidebar on
            every page. This usually takes a few seconds.
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setShow(false)}
          className="icon-button flex-none"
        >
          <XIcon size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
