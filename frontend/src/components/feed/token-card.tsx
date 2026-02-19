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
      <article className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#080808]">
        <div className="relative aspect-square w-full overflow-hidden border-b border-zinc-900 bg-zinc-950">
          {token.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={token.image}
              alt={token.symbol ?? "token"}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl font-bold text-zinc-600">
              {(token.symbol ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          {token.graduated && (
            <span className="absolute right-2 top-2 rounded-sm border border-zinc-700 bg-black/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-100">
              Live
            </span>
          )}
        </div>

        <div className="space-y-3 p-3">
          <div>
            <p className="truncate text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              Created: {truncate(token.creator ?? token.address, 6)}
            </p>
            <p className="truncate pt-1 text-xl font-bold leading-tight text-zinc-50">
              {token.name ?? "Unknown Token"}
            </p>
            <p className="truncate text-xs text-zinc-400">{token.description ?? "No description"}</p>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Market Cap</p>
            <p className="font-mono text-sm font-semibold text-primary">{formatMarketCap(token.xyz_reserves, xyzPriceUsd)}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-zinc-500">
              <span>{token.graduated ? "Listed" : "Seeding"}</span>
              <span>{progressValue.toFixed(0)}%</span>
            </div>
            <Progress
              value={progressValue}
              className="h-1 rounded-sm bg-zinc-900 [&>[data-slot=progress-indicator]]:bg-primary"
            />
          </div>

          <div className="flex items-center justify-between border-t border-zinc-900 pt-2 text-[11px] text-zinc-500">
            <span>{formatDistanceToNow(new Date(token.first_seen_at), { addSuffix: true })}</span>
            <span className="font-mono text-zinc-300">{formatPrice(token.current_price, xyzPriceUsd)}</span>
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
