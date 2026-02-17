"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
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

  const progressValue = token.graduated ? 100 : progress ? Math.min(100, progress.progress_percent) : 0;

  return (
    <Link href={`/token/${token.address}`} className="block w-full touch-manipulation">
      <article className="overflow-hidden rounded-sm border border-[#2a2a2a] bg-[#0a0a0a] transition-all hover:-translate-y-0.5 hover:border-[#b53f79]">
        <div className="relative aspect-square w-full overflow-hidden border-b border-[#1f1f1f] bg-[#111]">
          {token.image ? (
            <img
              src={token.image}
              alt={token.symbol ?? "token"}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl font-black text-[#9b9b9b]">
              {(token.symbol ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          {token.graduated && (
            <span className="absolute right-2 top-2 rounded-sm border border-[#2e2e2e] bg-[#0b0b0b] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#f0f0f0]">
              Live
            </span>
          )}
        </div>

        <div className="space-y-3 p-3">
          <div>
            <p className="truncate text-[10px] uppercase tracking-[0.12em] text-[#7f7f7f]">
              Created: {truncate(token.creator ?? token.address, 6)}
            </p>
            <p className="truncate pt-1 text-xl font-bold leading-tight text-white">
              {token.name ?? "Unknown Token"}
            </p>
            <p className="truncate text-xs text-[#9a9a9a]">{token.description ?? "No description"}</p>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[#7f7f7f]">Market Cap</p>
            <p className="font-mono text-sm font-semibold text-[#41dc76]">{formatMarketCap(token.xyz_reserves, xyzPriceUsd)}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-[#7f7f7f]">
              <span>{token.graduated ? "Listed" : "Seeding"}</span>
              <span>{progressValue.toFixed(0)}%</span>
            </div>
            <Progress
              value={progressValue}
              className="h-1 rounded-none bg-[#1f1f1f] [&>[data-slot=progress-indicator]]:bg-[#37d56a]"
            />
          </div>

          <div className="flex items-center justify-between border-t border-[#1f1f1f] pt-2 text-[11px] text-[#7f7f7f]">
            <span>{formatDistanceToNow(new Date(token.first_seen_at), { addSuffix: true })}</span>
            <span className="font-mono text-[#d2d2d2]">{formatPrice(token.current_price, xyzPriceUsd)}</span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function formatPrice(priceXyz: string, xyzPriceUsd: number): string {
  const usd = Number(priceXyz) * xyzPriceUsd;
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
