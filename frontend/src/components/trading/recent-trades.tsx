"use client";

import { useTokenTrades } from "@/hooks/use-token-trades";
import { useXyzPrice } from "@/hooks/use-xyz-price";
import { formatUsd } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface RecentTradesProps {
  tokenAddress: string;
  tokenSymbol: string;
}

export function RecentTrades({ tokenAddress, tokenSymbol }: RecentTradesProps) {
  const { data: trades, isLoading } = useTokenTrades(tokenAddress);
  const { xyzPriceUsd } = useXyzPrice();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Recent Transactions</h2>
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  Time
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  Type
                </th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                  USD
                </th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                  {tokenSymbol}
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  Trader
                </th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                  Tx
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <Skeleton className="h-4 w-16" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="h-4 w-10" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="h-4 w-20 ml-auto" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="h-4 w-20 ml-auto" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="h-4 w-8 ml-auto" />
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {!isLoading && trades && trades.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No trades yet
                  </td>
                </tr>
              )}

              {trades?.map((trade) => (
                <tr
                  key={trade.tx_hash}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {formatTimeAgo(trade.time)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${
                        trade.action === "buy"
                          ? "bg-green-500/15 text-green-600 dark:text-green-400"
                          : "bg-red-500/15 text-red-600 dark:text-red-400"
                      }`}
                    >
                      {trade.action === "buy" ? "Buy" : "Sell"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                    {formatUxyzAsUsd(trade.xyz_amount, xyzPriceUsd)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                    {formatMicroTokens(trade.token_amount)}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {truncateAddress(trade.trader)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      title={trade.tx_hash}
                    >
                      {trade.tx_hash.slice(0, 6)}...
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(isoTime: string): string {
  const now = Date.now();
  const then = new Date(isoTime).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatUxyzAsUsd(uxyz: string, xyzPriceUsd: number): string {
  const usd = (Number(uxyz) / 1_000_000) * xyzPriceUsd;
  return formatUsd(usd);
}

function formatMicroTokens(micro: string): string {
  const num = Number(micro) / 1_000_000;
  if (num === 0) return "0";
  if (num < 0.01) return num.toExponential(2);
  if (num < 1000) return num.toFixed(2);
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}
