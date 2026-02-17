"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
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
    <Link href={`/token/${token.address}`} className="block w-full touch-manipulation">
      <Card className="w-full gap-4 border-border/80 bg-card/75 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg hover:shadow-black/25">
        <CardContent className="space-y-4 px-4 sm:px-5">
          <div className="flex gap-3">
            {token.image ? (
              <img
                src={token.image}
                alt={token.symbol ?? "token"}
                className="h-16 w-16 rounded-xl object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-lg font-black text-muted-foreground">
                {(token.symbol ?? "?").slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-base font-bold text-foreground">{token.name ?? "Unknown Token"}</p>
                {token.graduated && <Badge variant="secondary">Graduated</Badge>}
              </div>
              <p className="truncate text-sm font-medium text-sky-300">${token.symbol ?? "???"}</p>
              <p className="truncate pt-1 text-xs text-muted-foreground">
                created by {truncate(token.creator ?? token.address, 6)} · {formatDistanceToNow(new Date(token.first_seen_at), { addSuffix: true })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">price</p>
              <p className="font-mono text-foreground">
                {token.current_price && token.current_price !== "0"
                  ? formatPrice(token.current_price, xyzPriceUsd)
                  : "--"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">market cap</p>
              <p className="font-mono text-emerald-400">{formatMarketCap(token.xyz_reserves, xyzPriceUsd)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">24h volume</p>
              <p className="font-mono text-foreground">{formatVolume(token.volume_24h, xyzPriceUsd)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">24h trades</p>
              <p className="font-mono text-foreground">{token.trade_count_24h}</p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">bonding progress</span>
              <span className="font-mono text-foreground">{progressValue.toFixed(1)}%</span>
            </div>
            <Progress value={progressValue} className="h-1.5" />
          </div>

          {token.description && (
            <p className="truncate text-sm text-muted-foreground">{token.description}</p>
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
  if (!volumeUxyz || volumeUxyz === "0") return "$0";
  const usd = (Number(volumeUxyz) / 1_000_000) * xyzPriceUsd;
  return formatUsd(usd);
}

function formatMarketCap(reservesUxyz: string, xyzPriceUsd: number): string {
  const usd = (Number(reservesUxyz || "0") / 1_000_000) * xyzPriceUsd;
  return formatUsd(usd);
}

function truncate(value: string, size: number): string {
  if (value.length <= size * 2) return value;
  return `${value.slice(0, size)}...${value.slice(-size)}`;
}
