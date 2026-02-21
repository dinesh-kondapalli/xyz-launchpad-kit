"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "xyz-launchpad-welcome-seen";

export function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setOpen(true);
    }
  }, []);

  function handleClose() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        {/* Header band */}
        <div className="bg-primary/10 border-b border-primary/20 px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-zinc-50">
              Welcome to XYZ Launchpad
            </DialogTitle>
            <p className="text-sm text-zinc-400 mt-1">
              A fair-launch platform designed to reward builders and long-term holders.
            </p>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 text-sm text-zinc-300">
          <div>
            <h3 className="font-semibold text-zinc-100 mb-1">How it works</h3>
            <p>
              Every token launches on a bonding curve — price starts low and rises as people buy.
              Once the reserve hits the graduation threshold, liquidity auto-migrates to the AMM
              pool for open trading.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-zinc-100 mb-1">Non-extractive by design</h3>
            <p className="mb-2">
              The fee structure is intentionally asymmetric to discourage quick dumps and reward conviction:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
                <span className="block text-xs text-zinc-500 uppercase tracking-wide">Buy fee</span>
                <span className="text-lg font-semibold text-emerald-400">0.5%</span>
              </div>
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
                <span className="block text-xs text-zinc-500 uppercase tracking-wide">Sell fee</span>
                <span className="text-lg font-semibold text-red-400">3.5%</span>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Low entry cost, higher exit cost — aligned with builders who stay, not extractors who flip.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-zinc-100 mb-1">Creators earn</h3>
            <p>
              20% of all trading fees go directly to the token creator — rewarding the people who build real communities, not just deploy and vanish.
            </p>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 pb-6 pt-2">
          <Button onClick={handleClose} className="w-full" size="lg">
            Got it, let&apos;s go
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
