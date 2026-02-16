"use client";

import { useTokenHolders } from "@/hooks/use-token-holders";
import { Skeleton } from "@/components/ui/skeleton";

interface TokenHoldersProps {
  tokenAddress: string;
  tokenSymbol: string;
}

const TOTAL_SUPPLY_MICRO = 100_000_000_000_000; // 100M * 10^6

export function TokenHolders({ tokenAddress, tokenSymbol }: TokenHoldersProps) {
  const { data: holders, isLoading } = useTokenHolders(tokenAddress);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">
        Holders
        {holders && holders.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground ml-2">
            ({holders.length})
          </span>
        )}
      </h2>
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10">
                  #
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                  Address
                </th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                  Balance
                </th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-20">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <Skeleton className="h-4 w-4" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="h-4 w-40" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="h-4 w-24 ml-auto" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="h-4 w-12 ml-auto" />
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {!isLoading && holders && holders.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No holders yet
                  </td>
                </tr>
              )}

              {holders?.map((holder, i) => {
                const pct =
                  (Number(holder.balance) / TOTAL_SUPPLY_MICRO) * 100;
                return (
                  <tr
                    key={holder.address}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-2 text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {truncateAddress(holder.address)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                      {formatBalance(holder.balance)} {tokenSymbol}
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                      {pct < 0.01 ? "<0.01" : pct.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatBalance(micro: string): string {
  const num = Number(micro) / 1_000_000;
  if (num === 0) return "0";
  if (num < 0.01) return num.toExponential(2);
  if (num < 1000) return num.toFixed(2);
  if (num < 1_000_000) return `${(num / 1000).toFixed(1)}K`;
  return `${(num / 1_000_000).toFixed(2)}M`;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 20) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}
