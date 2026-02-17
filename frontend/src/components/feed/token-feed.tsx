"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTokens } from "@/hooks/use-tokens";
import { useSSEFeed } from "@/hooks/use-sse";
import { TokenCard } from "./token-card";
import { TokenCardSkeleton } from "./token-card-skeleton";
import type { TokenListItem } from "@/lib/api";

type SortMode = "newest" | "trending" | "graduating";

function sortTokens(tokens: TokenListItem[], mode: SortMode): TokenListItem[] {
  const filtered = mode === "graduating" ? tokens.filter((t) => !t.graduated) : tokens;

  switch (mode) {
    case "newest":
      return [...filtered].sort(
        (a, b) => new Date(b.first_seen_at).getTime() - new Date(a.first_seen_at).getTime()
      );
    case "trending":
      return [...filtered].sort((a, b) => (b.trade_count_24h ?? 0) - (a.trade_count_24h ?? 0));
    case "graduating":
      return [...filtered].sort((a, b) => (Number(b.xyz_reserves) || 0) - (Number(a.xyz_reserves) || 0));
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

  const stats = useMemo(() => {
    const totalCoins = filteredTokens.length;
    const totalVolume = filteredTokens.reduce((sum, token) => sum + Number(token.volume_24h || "0"), 0) / 1_000_000;
    const totalReserves = filteredTokens.reduce((sum, token) => sum + Number(token.xyz_reserves || "0"), 0) / 1_000_000;
    const totalTrades = filteredTokens.reduce((sum, token) => sum + Number(token.trade_count_24h || 0), 0);
    return { totalCoins, totalVolume, totalReserves, totalTrades };
  }, [filteredTokens]);

  return (
    <div className="space-y-5">
      <section className="rounded-sm border border-[#1c1c1c] bg-[#050505] p-4 sm:p-6">
        {featuredToken ? (
          <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-[190px_1fr] md:items-center">
            {featuredToken.image ? (
              <img
                src={featuredToken.image}
                alt={featuredToken.symbol ?? "token"}
                className="h-[190px] w-[190px] rounded-sm border border-[#2a2a2a] object-cover"
              />
            ) : (
              <div className="flex h-[190px] w-[190px] items-center justify-center rounded-sm border border-[#2a2a2a] bg-[#101010] text-4xl font-black text-[#bdbdbd]">
                {(featuredToken.symbol ?? "?").slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <p className="text-4xl font-black tracking-tight text-white">
                  {featuredToken.name ?? "Unnamed Token"}
                </p>
                <p className="pt-1 text-xs uppercase tracking-[0.14em] text-[#8e8e8e]">
                  created by <span className="font-semibold text-[#ff4ea3]">{truncate(featuredToken.creator ?? featuredToken.address, 5)}</span>
                </p>
                <p className="pt-2 text-sm text-[#c2c2c2]">{featuredToken.description ?? featuredToken.symbol ?? "New launch"}</p>
              </div>

              <div className="max-w-[280px]">
                <p className="text-xs uppercase tracking-[0.1em] text-[#8e8e8e]">Market Cap</p>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-sm font-semibold text-white">{formatCompact(stats.totalReserves)} SOL</span>
                  <span className="h-[3px] flex-1 bg-[#1e1e1e]">
                    <span className="block h-[3px] w-2/5 bg-[#37d56a]" />
                  </span>
                </div>
              </div>

              <Button
                asChild
                className="h-11 rounded-sm border border-[#d95a9b] bg-[#efefef] px-6 text-sm font-semibold text-black hover:bg-white"
              >
                <Link href="/create">Start a new coin</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-14 text-center text-[#9b9b9b]">No live launches yet.</div>
        )}
      </section>

      <section className="grid grid-cols-2 overflow-hidden rounded-sm border border-[#1c1c1c] bg-[#050505] sm:grid-cols-4">
        <StatCard label="Total Coins" value={formatCompact(stats.totalCoins)} />
        <StatCard label="Total Volume" value={`${formatCompact(stats.totalVolume)} SOL`} />
        <StatCard label="Total Reserves" value={`${formatCompact(stats.totalReserves)} SOL`} />
        <StatCard label="Total Trades" value={formatCompact(stats.totalTrades)} />
      </section>

      <section className="space-y-4 rounded-sm border border-[#1c1c1c] bg-[#050505] p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#777]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search token here..."
              className="h-10 rounded-sm border-[#2b2b2b] bg-[#0c0c0c] pl-9 text-sm text-[#e7e7e7]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-sm border-[#2b2b2b] bg-[#0c0c0c] text-[#d0d0d0] hover:bg-[#151515]"
            >
              <SlidersHorizontal className="size-3.5" />
              Bump Order
            </Button>
            <SortPill active={sortMode === "newest"} onClick={() => setSortMode("newest")}>Newest</SortPill>
            <SortPill active={sortMode === "trending"} onClick={() => setSortMode("trending")}>Trending</SortPill>
            <SortPill active={sortMode === "graduating"} onClick={() => setSortMode("graduating")}>Graduating</SortPill>
          </div>
        </div>

        {error && (
          <div className="rounded-sm border border-[#66283f] bg-[#28121b] p-4 text-center text-[#ff8fbc]">
            Failed to load tokens. Please try again later.
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <TokenCardSkeleton key={i} />)
            : filteredTokens.map((token) => <TokenCard key={token.address} token={token} />)}
        </div>

        {!isLoading && !error && filteredTokens.length === 0 && (
          <p className="py-14 text-center text-[#8d8d8d]">No active token launches found.</p>
        )}
      </section>

      <p className="px-2 text-center text-[11px] text-[#747474]">
        Disclaimer: OpenFund is experimental software and data can be delayed. Always verify token metadata and smart
        contract addresses before making any trade decisions.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-[#171717] px-4 py-4 text-center last:border-r-0">
      <p className="text-3xl font-bold tracking-tight text-white">{value}</p>
      <p className="text-xs uppercase tracking-[0.12em] text-[#7d7d7d]">{label}</p>
    </div>
  );
}

function SortPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-sm border px-3 text-xs font-medium uppercase tracking-[0.1em] transition-colors ${
        active
          ? "border-[#b7437c] bg-[#2a111c] text-[#ffa7d0]"
          : "border-[#2b2b2b] bg-[#0c0c0c] text-[#bbbbbb] hover:bg-[#151515]"
      }`}
    >
      {children}
    </button>
  );
}

function truncate(value: string, size: number): string {
  if (value.length <= size * 2) return value;
  return `${value.slice(0, size)}...${value.slice(-size)}`;
}

function formatCompact(value: number): string {
  return Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value < 1000 ? 1 : 2,
  }).format(value || 0);
}
