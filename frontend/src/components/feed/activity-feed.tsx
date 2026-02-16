"use client";

import { useRecentTrades } from "@/hooks/use-recent-trades";
import { ActivityItem } from "./activity-item";
import { Skeleton } from "@/components/ui/skeleton";

export function ActivityFeed() {
  const { data: trades, isLoading, error } = useRecentTrades(50);

  return (
    <div className="space-y-4">
      {/* Section header with live indicator */}
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold text-zinc-100">Recent Activity</h2>
        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load recent activity.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && (!trades || trades.length === 0) && (
          <p className="py-8 text-center text-zinc-400">
            No recent trades
          </p>
      )}

      {/* Trade list */}
      {!isLoading && !error && trades && trades.length > 0 && (
        <div className="max-h-[600px] overflow-y-auto overscroll-behavior-y-contain space-y-2">
          {trades.map((trade) => (
            <ActivityItem key={trade.tx_hash} trade={trade} />
          ))}
        </div>
      )}
    </div>
  );
}
