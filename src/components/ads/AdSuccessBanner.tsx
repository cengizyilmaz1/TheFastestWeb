"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { acknowledgeCheckout } from "@/components/pricing/checkout-client";

export function AdSuccessBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("checkout");
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const show = Boolean(orderId && confirmedOrderId === orderId);
  useEffect(() => {
    if (!orderId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(orderId)) return;
    let active = true, attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function check() {
      try {
        const response = await fetch("/api/payments/orders/" + orderId, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        const result = response.ok ? await response.json() : null;
        if (!active || !result) return;
        if (result.status === "paid") {
          setConfirmedOrderId(orderId);
          acknowledgeCheckout(orderId!);
          router.refresh();
          return;
        }
        if (["failed", "refunded", "cancelled"].includes(result.status)) return;
        if (++attempts < 20) timer = setTimeout(check, 3000);
      } catch { /* A failed receipt lookup never becomes payment success. */ }
    }
    void check();
    return () => { active = false; controller.abort(); if (timer) clearTimeout(timer); };
  }, [orderId, router]);

  if (!show) return null;

  return (
    <div className="max-w-[700px] mx-auto px-5 pt-4">
      <div className="bg-gradient-to-r from-[rgba(34,197,94,0.12)] to-[rgba(34,197,94,0.04)] border border-green/30 rounded-[12px] px-4 py-3.5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-green/20 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-green text-lg font-bold">&#10003;</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-[0.95rem] text-text-primary">
            Your payment is confirmed
          </div>
          <p className="text-[0.78rem] text-text-secondary mt-0.5">
            Your purchase has been confirmed. Any associated access or placement
            updates will appear when processing is complete.
          </p>
        </div>
        <button
          onClick={() => setConfirmedOrderId(null)}
          className="text-text-muted hover:text-text-primary transition-colors text-lg leading-none border-none bg-transparent cursor-pointer p-1"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}
