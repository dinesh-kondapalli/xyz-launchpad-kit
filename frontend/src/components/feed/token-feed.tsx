"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  const [query, setQuery] = useState("");
  const { data: tokens, isLoading, error } = useTokens();

  useSSEFeed();

  const sortedTokens = useMemo(() => {
    if (!tokens) return [];
    return sortTokens(tokens, sortMode);
  }, [tokens, sortMode]);

  const filteredTokens = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedTokens;
    return sortedTokens.filter((token) => {
      const name = token.name?.toLowerCase() ?? "";
      const symbol = token.symbol?.toLowerCase() ?? "";
      const creator = token.creator?.toLowerCase() ?? "";
      return (
        name.includes(q) ||
        symbol.includes(q) ||
        creator.includes(q) ||
        token.address.toLowerCase().includes(q)
      );
    });
  }, [query, sortedTokens]);

  const featuredToken = filteredTokens[0];
  const marqueeTokens = filteredTokens.slice(0, 2);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap gap-2">
        {/*{marqueeTokens.length > 0 ? (
          marqueeTokens.map((token, idx) => (
            <Link
              key={token.address}
              href={`/token/${token.address}`}
              className={idx === 0 ? "rounded-md border border-rose-200/35 bg-rose-300/20 px-3 py-2 text-sm text-rose-100 transition-colors hover:bg-rose-300/30" : "rounded-md border border-sky-200/35 bg-sky-300/20 px-3 py-2 text-sm text-sky-100 transition-colors hover:bg-sky-300/30"}
            >
              <span className="font-semibold">{truncate(token.creator ?? token.address, 8)}</span>{" "}
              {token.trade_count_24h > 0 ? "is moving" : "created"}{" "}
              <span className="font-semibold">{token.symbol ?? "TOKEN"}</span>
            </Link>
          ))
        ) : (
          <span className="rounded-md border border-border bg-card/70 px-3 py-2 text-sm text-muted-foreground">
            Waiting for fresh launches...
          </span>
        )}*/}
      </div>

      <section className="rounded-2xl border border-border/70 bg-card/65 px-4 py-6 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">[start a new coin]</h1>

          {featuredToken && (
            <Link
              href={`/token/${featuredToken.address}`}
              className="flex w-full max-w-xl items-center gap-4 rounded-xl border border-border/80 bg-background/80 p-4 text-left transition-colors hover:border-primary/50"
            >
              {featuredToken.image ? (
                <img
                  src={featuredToken.image}
                  alt={featuredToken.symbol ?? "token"}
                  className="h-16 w-16 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-xl font-black text-muted-foreground">
                  {(featuredToken.symbol ?? "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold text-foreground">{featuredToken.name ?? "Unknown Token"}</p>
                <p className="truncate text-sm text-muted-foreground">
                  by {truncate(featuredToken.creator ?? featuredToken.address, 8)} · {formatDistanceToNow(new Date(featuredToken.first_seen_at), { addSuffix: true })}
                </p>
                <p className="truncate text-sm text-emerald-400">
                  {featuredToken.graduated ? "graduated" : "active launch"} · {featuredToken.trade_count_24h} trades (24h)
                </p>
              </div>
              <Badge variant={featuredToken.graduated ? "secondary" : "default"}>
                {featuredToken.graduated ? "live" : "new"}
              </Badge>
            </Link>
          )}

          <div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search token, symbol, creator, address"
              className="h-11 border-border/90 bg-background/90"
            />
            <Button asChild className="h-11 min-w-28 font-semibold">
              <Link href="/create">Create</Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <TabsList className="h-auto rounded-xl border border-border/80 bg-card/80 p-1">
            <TabsTrigger value="newest" className="px-4 py-2">Newest</TabsTrigger>
            <TabsTrigger value="trending" className="px-4 py-2">Trending</TabsTrigger>
            <TabsTrigger value="graduating" className="px-4 py-2">Graduating</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="text-sm text-muted-foreground">
          {filteredTokens.length} tokens shown
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center text-destructive">
          Failed to load tokens. Please try again later.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {isLoading
          ? Array.from({ length: 9 }).map((_, i) => (
              <TokenCardSkeleton key={i} />
            ))
          : filteredTokens.map((token) => (
              <TokenCard key={token.address} token={token} />
            ))}
      </div>

      {!isLoading && !error && filteredTokens.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          No active token launches found.
        </p>
      )}
    </div>
  );
}

function truncate(value: string, size: number): string {
  if (value.length <= size * 2) return value;
  return `${value.slice(0, size)}...${value.slice(-size)}`;
}
