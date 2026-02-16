"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { TokenListItem } from "@/lib/api";
import { useCurveProgress } from "@/hooks/use-curve-progress";
import { useXyzPrice } from "@/hooks/use-xyz-price";
import { formatUsd } from "@/lib/utils";

interface TokenCardProps {
  token: TokenListItem;
}

export function TokenCard({ token }: TokenCardProps) {
  const { data: progress } = useCurveProgress(token.address);
  const { xyzPriceUsd } = useXyzPrice();

  const progressValue = token.graduated
    ? 100
    : progress
      ? Math.min(100, progress.progress_percent)
      : 0; // 0 while loading (brief flash, acceptable)

  return (
    <Link href={`/token/${token.address}`} className="block touch-manipulation">
      <Card className="hover:border-primary/50 transition-colors">
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
        {token.image ? (
          <img
            src={token.image}
            alt={token.symbol ?? ""}
            className="h-10 w-10 rounded-full object-cover"
            onError={(e) => {
              // Replace broken image with fallback
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold">
            {(token.symbol ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <CardTitle className="text-base truncate">
            {token.name ?? "Unknown Token"}
          </CardTitle>
          <p className="text-sm text-muted-foreground truncate">
            ${token.symbol ?? "???"}
          </p>
        </div>
        {token.graduated && (
          <Badge variant="secondary">Graduated</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Price</span>
          <span className="font-mono">
            {token.current_price && token.current_price !== "0"
              ? formatPrice(token.current_price, xyzPriceUsd)
              : "--"}
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono">{progressValue.toFixed(1)}%</span>
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>
        {token.volume_24h && token.volume_24h !== "0" && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">24h Vol</span>
            <span className="font-mono">{formatVolume(token.volume_24h, xyzPriceUsd)}</span>
          </div>
        )}
      </CardContent>
      </Card>
    </Link>
  );
}

// Contract returns current_price as a decimal string in XYZ (e.g. "0.000001")
function formatPrice(priceXyz: string, xyzPriceUsd: number): string {
  const usd = Number(priceXyz) * xyzPriceUsd;
  return formatUsd(usd);
}

function formatVolume(volumeUxyz: string, xyzPriceUsd: number): string {
  const usd = (Number(volumeUxyz) / 1_000_000) * xyzPriceUsd;
  return formatUsd(usd);
}
