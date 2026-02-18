"use client";

import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyableBlock } from "@/components/ui/copyable-block";
import { BuyForm } from "@/components/trading/buy-form";
import { SellForm } from "@/components/trading/sell-form";
import { SwapForm } from "@/components/trading/swap-form";
import { useTokenDetail } from "@/hooks/use-token-detail";
import { useXyzPrice } from "@/hooks/use-xyz-price";
import { formatUsd } from "@/lib/utils";
import { TradingChartSkeleton } from "@/components/trading/trading-chart-skeleton";
import { RecentTrades } from "@/components/trading/recent-trades";
import { BondingCurveChart } from "@/components/trading/bonding-curve-chart";
import { TokenHolders } from "@/components/trading/token-holders";
import { DEFAULT_TOKEN_SUPPLY } from "@/lib/chain-config";

const TradingChart = dynamic(
  () =>
    import("@/components/trading/trading-chart").then(
      (mod) => mod.TradingChart,
    ),
  {
    ssr: false,
    loading: () => <TradingChartSkeleton />,
  },
);

export default function TokenDetailPage() {
  const params = useParams();
  const tokenAddress = params.address as string;
  const { data: token, isLoading, error } = useTokenDetail(tokenAddress);
  const { xyzPriceUsd } = useXyzPrice();

  return (
    <div className="mx-auto w-full max-w-7xl overflow-x-hidden py-2">

      {isLoading && (
        <div className="w-full space-y-8">
          <section className="w-full">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-stretch">
              <div className="space-y-4">
                <div className="flex items-center gap-4 rounded-2xl border border-zinc-900 bg-[#050505] p-4">
                  <Skeleton className="h-16 w-16 rounded-2xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Skeleton className="h-28 w-full rounded-2xl" />
                  <Skeleton className="h-28 w-full rounded-2xl" />
                  <Skeleton className="h-28 w-full rounded-2xl" />
                  <Skeleton className="h-28 w-full rounded-2xl" />
                </div>
              </div>
              <div className="h-full">
                <div className="flex h-full flex-col gap-4">
                  <Skeleton className="h-[24rem] w-full rounded-2xl" />
                  <Skeleton className="h-28 w-full rounded-2xl" />
                </div>
              </div>
            </div>
          </section>

          <section className="w-full space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-9 w-48" />
            </div>
            <Skeleton className="h-[400px] w-full rounded-2xl" />
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </section>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-zinc-800 bg-pink-950/30 p-6 text-center">
          <p className="font-medium text-pink-300">Token not found</p>
          <p className="mt-2 text-sm text-zinc-500">
            The token at {tokenAddress} could not be loaded.
          </p>
        </div>
      )}

      {token && (
        <div className="w-full space-y-8">
          <section className="w-full">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-stretch">
              <div className="space-y-4">
                <div className="flex items-center gap-4 rounded-2xl border border-zinc-900 bg-[#050505] p-4">
                  {token.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={token.image}
                      alt={token.symbol ?? ""}
                      className="h-16 w-16 rounded-2xl object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 text-xl font-bold text-zinc-300">
                      {(token.symbol ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h1 className="flex items-center gap-3 text-3xl font-bold text-zinc-50">
                      {token.name ?? "Unknown Token"}
                      {token.graduated && (
                        <Badge variant="secondary">Graduated</Badge>
                      )}
                    </h1>
                    <p className="text-lg text-zinc-400">
                      ${token.symbol ?? "???"}
                    </p>
                  </div>
                </div>

                {token.description && (
                  <div className="rounded-2xl border border-zinc-900 bg-[#050505] p-4">
                    <h2 className="mb-1 text-sm font-medium text-zinc-500">
                      Description
                    </h2>
                    <p className="whitespace-pre-wrap text-sm text-zinc-200">
                      {token.description}
                    </p>
                  </div>
                )}

                {token.creator && (
                  <div className="rounded-2xl border border-zinc-900 bg-[#050505] p-4">
                    <h2 className="mb-1 text-sm font-medium text-zinc-500">
                      Creator
                    </h2>
                    <CopyableBlock
                      text={token.creator}
                      truncate={false}
                    />
                  </div>
                )}

                <div className="rounded-2xl border border-zinc-900 bg-[#050505] p-4">
                  <h2 className="mb-1 text-sm font-medium text-zinc-500">
                    Contract Address
                  </h2>
                  <CopyableBlock
                    text={tokenAddress}
                    truncate={false}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="flex min-h-[6.5rem] flex-col justify-between gap-2 rounded-2xl border border-zinc-900 bg-[#050505] p-4">
                    <p className="text-xs text-zinc-500">Market Cap</p>
                    <p className="font-mono text-xl text-zinc-100">
                      {token.current_price && token.current_price !== "0"
                        ? formatMarketCap(token.current_price, xyzPriceUsd)
                        : "--"}
                    </p>
                  </div>
                  <div className="flex min-h-[6.5rem] flex-col justify-between gap-2 rounded-2xl border border-zinc-900 bg-[#050505] p-4">
                    <p className="text-xs text-zinc-500">Price</p>
                    <p className="font-mono text-xl text-zinc-100">
                      {token.current_price && token.current_price !== "0"
                        ? formatDetailPrice(token.current_price, xyzPriceUsd)
                        : "--"}
                    </p>
                  </div>
                  <div className="flex min-h-[6.5rem] flex-col justify-between gap-2 rounded-2xl border border-zinc-900 bg-[#050505] p-4">
                    <p className="text-xs text-zinc-500">24h Volume</p>
                    <p className="font-mono text-xl text-zinc-100">
                      {token.volume_24h && token.volume_24h !== "0"
                        ? formatDetailVolume(token.volume_24h, xyzPriceUsd)
                        : "--"}
                    </p>
                  </div>
                  <div className="flex min-h-[6.5rem] flex-col justify-between gap-2 rounded-2xl border border-zinc-900 bg-[#050505] p-4">
                    <p className="text-xs text-zinc-500">24h Trades</p>
                    <p className="font-mono text-xl text-zinc-100">
                      {token.trade_count_24h ?? 0}
                    </p>
                  </div>
                </div>

              </div>

              <div className="h-full">
                <div className="flex h-full flex-col gap-4">
                  {token.graduated ? (
                    <div className="flex flex-1 flex-col space-y-4 rounded-2xl border border-zinc-900 bg-[#050505] p-4">
                      <div className="text-center">
                        <Badge variant="secondary" className="text-base px-4 py-1">
                          Graduated to AMM
                        </Badge>
                      </div>
                      <SwapForm
                        tokenAddress={tokenAddress}
                        tokenSymbol={token.symbol ?? "TOKEN"}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col rounded-2xl border border-zinc-900 bg-[#050505] p-4">
                      <Tabs defaultValue="buy" className="flex h-full flex-col">
                        <TabsList className="inline-flex h-10 w-full items-stretch rounded-xl border border-zinc-800 bg-zinc-950 p-1">
                          <TabsTrigger value="buy" className="flex-1 rounded-lg font-semibold">
                            Buy
                          </TabsTrigger>
                          <TabsTrigger value="sell" className="flex-1 rounded-lg font-semibold">
                            Sell
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="buy" className="mt-4 flex-1">
                          <BuyForm
                            tokenAddress={tokenAddress}
                            tokenSymbol={token.symbol ?? "TOKEN"}
                          />
                        </TabsContent>
                        <TabsContent value="sell" className="mt-4 flex-1">
                          <SellForm
                            tokenAddress={tokenAddress}
                            tokenSymbol={token.symbol ?? "TOKEN"}
                          />
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}

                  <BondingCurveChart tokenAddress={tokenAddress} />
                </div>
              </div>
            </div>
          </section>

          <section className="w-full">
            <TradingChart tokenAddress={tokenAddress} />
          </section>

          <section className="w-full">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <RecentTrades
                tokenAddress={tokenAddress}
                tokenSymbol={token.symbol ?? "TOKEN"}
              />
              <TokenHolders
                tokenAddress={tokenAddress}
                tokenSymbol={token.symbol ?? "TOKEN"}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function formatMarketCap(priceXyz: string, xyzPriceUsd: number): string {
  const fdvUsd = Number(priceXyz) * DEFAULT_TOKEN_SUPPLY * xyzPriceUsd;
  return formatUsd(fdvUsd);
}

function formatDetailPrice(priceXyz: string, xyzPriceUsd: number): string {
  const usd = Number(priceXyz) * xyzPriceUsd;
  return formatUsd(usd);
}

function formatDetailVolume(volumeUxyz: string, xyzPriceUsd: number): string {
  const usd = (Number(volumeUxyz) / 1_000_000) * xyzPriceUsd;
  return formatUsd(usd);
}
