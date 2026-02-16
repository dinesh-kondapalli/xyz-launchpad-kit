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
      <div className="rounded-lg border p-4 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-6 w-full rounded-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!progress) return null;

  if (progress.graduated) {
    return (
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Bonding Curve</h3>
          <Badge variant="secondary">Graduated</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
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
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Bonding Curve Progress</h3>
        <span className="text-xs font-mono font-medium">
          {progressPct.toFixed(1)}%
        </span>
      </div>

      <div className="h-5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${Math.max(progressPct, 0.5)}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatUsd(raisedUsd)} raised</span>
        <span>{formatUsd(thresholdUsd)} to graduate</span>
      </div>
    </div>
  );
}
