"use client";

import { useCurveProgress } from "@/hooks/use-curve-progress";
import { useXyzPrice } from "@/hooks/use-xyz-price";
import { formatUsd } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface BondingCurveChartProps {
  tokenAddress: string;
}

export function BondingCurveChart({ tokenAddress }: BondingCurveChartProps) {
  const { data: progress, isLoading } = useCurveProgress(tokenAddress);
  const { xyzPriceUsd } = useXyzPrice();

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-2xl border border-zinc-900 bg-[#050505] p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-6 w-full rounded-sm" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!progress) return null;

  if (progress.graduated) {
    return (
      <div className="space-y-3 rounded-2xl border border-zinc-900 bg-[#050505] p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-zinc-100">Bonding Curve</h3>
          <Badge variant="secondary">Graduated</Badge>
        </div>
        <p className="text-sm text-zinc-500">
          This token has graduated to the AMM. The bonding curve is now closed.
        </p>
      </div>
    );
  }

  const xyzReserves = Number(progress.xyz_reserves);
  const gradThreshold = Number(progress.graduation_threshold);
  const progressPct = Math.min(progress.progress_percent, 100);

  const raisedUsd = (xyzReserves / 1e6) * xyzPriceUsd;
  const thresholdUsd = (gradThreshold / 1e6) * xyzPriceUsd;

  return (
    <div className="space-y-2 rounded-2xl border border-zinc-900 bg-[#050505] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">Bonding Curve Progress</h3>
        <span className="text-xs font-mono font-medium text-zinc-200">
          {progressPct.toFixed(1)}%
        </span>
      </div>

      <div className="h-5 w-full overflow-hidden rounded-sm bg-zinc-900">
        <div
          className="h-full rounded-sm bg-pink-700 transition-all duration-500"
          style={{ width: `${Math.max(progressPct, 0.5)}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-zinc-500">
        <span>{formatUsd(raisedUsd)} raised</span>
        <span>{formatUsd(thresholdUsd)} to graduate</span>
      </div>
    </div>
  );
}
