"use client";

import { useState } from "react";
import { AdPurchaseModal } from "@/components/ads/AdPurchaseModal";

interface AdCTAProps {
  position?: "left" | "right";
}

export function AdCTA({ position }: AdCTAProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="bg-bg-card border border-dashed border-border rounded-[10px] px-2.5 py-2.5 text-center cursor-pointer transition-all duration-250 flex-1 flex flex-col items-center justify-center min-h-0 hover:border-accent hover:bg-accent-glow w-full"
      >
        <div className="w-[40px] h-[40px] flex items-center justify-center text-2xl mb-1.5 shrink-0">📢</div>
        <div className="text-[0.72rem] font-semibold text-text-muted">
          Advertise
        </div>
      </button>
      <AdPurchaseModal open={modalOpen} onClose={() => setModalOpen(false)} preferredPosition={position} />
    </>
  );
}
