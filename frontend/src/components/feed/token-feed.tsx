"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTokens } from "@/hooks/use-tokens";
import { useSSEFeed } from "@/hooks/use-sse";
import { TokenCard } from "./token-card";
import { TokenCardSkeleton } from "./token-card-skeleton";
import type { TokenListItem } from "@/lib/api";

type SortMode = "newest" | "trending" | "graduating";

function sortTokens(tokens: TokenListItem[], mode: SortMode): TokenListItem[] {
  // Filter to non-graduated for "graduating" tab, show all for others
  const filtered = mode === "graduating"
    ? tokens.filter((t) => !t.graduated)
    : tokens;

  switch (mode) {
    case "newest":
      return [...filtered].sort(
        (a, b) =>
          new Date(b.first_seen_at).getTime() -
          new Date(a.first_seen_at).getTime()
      );
    case "trending":
      return [...filtered].sort(
        (a, b) => (b.trade_count_24h ?? 0) - (a.trade_count_24h ?? 0)
      );
    case "graduating":
      return [...filtered].sort(
        (a, b) =>
          (Number(b.xyz_reserves) || 0) - (Number(a.xyz_reserves) || 0)
      );
    default:
      return filtered;
  }
}

export function TokenFeed() {
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const { data: tokens, isLoading, error } = useTokens();

  // Subscribe to SSE for real-time cache updates
  useSSEFeed();

  const sortedTokens = useMemo(() => {
    if (!tokens) return [];
    return sortTokens(tokens, sortMode);
  }, [tokens, sortMode]);

  return (
    <div className="space-y-6">
      <Tabs
        value={sortMode}
        onValueChange={(v) => setSortMode(v as SortMode)}
      >
        <TabsList>
          <TabsTrigger value="newest">New Launches</TabsTrigger>
          <TabsTrigger value="trending">Trending</TabsTrigger>
          <TabsTrigger value="graduating">Graduating Soon</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center text-destructive">
          Failed to load tokens. Please try again later.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <TokenCardSkeleton key={i} />
            ))
          : sortedTokens.map((token) => (
              <TokenCard key={token.address} token={token} />
            ))}
      </div>

      {!isLoading && !error && sortedTokens.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          No active token launches found.
        </p>
      )}
    </div>
  );
}
