"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
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
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 overflow-x-hidden">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
        >
          &larr; Back to launches
        </Link>

        {isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-[400px] w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
            <p className="text-destructive font-medium">Token not found</p>
            <p className="text-sm text-muted-foreground mt-2">
              The token at {tokenAddress} could not be loaded.
            </p>
          </div>
        )}

        {token && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Token info (2/3 width on desktop) */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center gap-4">
                {token.image ? (
                  <img
                    src={token.image}
                    alt={token.symbol ?? ""}
                    className="h-16 w-16 rounded-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-bold">
                    {(token.symbol ?? "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="text-3xl font-bold flex items-center gap-3">
                    {token.name ?? "Unknown Token"}
                    {token.graduated && (
                      <Badge variant="secondary">Graduated</Badge>
                    )}
                  </h1>
                  <p className="text-lg text-muted-foreground">
                    ${token.symbol ?? "???"}
                  </p>
                </div>
              </div>

              {token.description && (
                <div>
                  <h2 className="text-sm font-medium text-muted-foreground mb-1">
                    Description
                  </h2>
                  <p className="text-sm whitespace-pre-wrap">
                    {token.description}
                  </p>
                </div>
              )}

              {token.creator && (
                <div>
                  <h2 className="text-sm font-medium text-muted-foreground mb-1">
                    Creator
                  </h2>
                  <p className="text-sm font-mono break-all">
                    {token.creator}
                  </p>
                </div>
              )}

              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-1">
                  Contract Address
                </h2>
                <p className="text-sm font-mono break-all">
                  {tokenAddress}
                </p>
              </div>

              {/* Price and stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Market Cap</p>
                  <p className="font-mono text-lg">
                    {token.current_price && token.current_price !== "0"
                      ? formatMarketCap(token.current_price, xyzPriceUsd)
                      : "--"}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="font-mono text-lg">
                    {token.current_price && token.current_price !== "0"
                      ? formatDetailPrice(token.current_price, xyzPriceUsd)
                      : "--"}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">24h Volume</p>
                  <p className="font-mono text-lg">
                    {token.volume_24h && token.volume_24h !== "0"
                      ? formatDetailVolume(token.volume_24h, xyzPriceUsd)
                      : "--"}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">24h Trades</p>
                  <p className="font-mono text-lg">
                    {token.trade_count_24h ?? 0}
                  </p>
                </div>
              </div>

              {/* Price Chart */}
              <TradingChart tokenAddress={tokenAddress} />
            </div>

            {/* Right: Trading interface (1/3 width on desktop) */}
            <div className="space-y-6">
              {token.graduated ? (
                <div className="rounded-lg border p-4 space-y-4">
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
                <div className="rounded-lg border p-4">
                  <Tabs defaultValue="buy">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="buy" className="min-h-[44px]">Buy</TabsTrigger>
                      <TabsTrigger value="sell" className="min-h-[44px]">Sell</TabsTrigger>
                    </TabsList>
                    <TabsContent value="buy" className="mt-4">
                      <BuyForm
                        tokenAddress={tokenAddress}
                        tokenSymbol={token.symbol ?? "TOKEN"}
                      />
                    </TabsContent>
                    <TabsContent value="sell" className="mt-4">
                      <SellForm
                        tokenAddress={tokenAddress}
                        tokenSymbol={token.symbol ?? "TOKEN"}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              {/* Bonding Curve Progress */}
              <BondingCurveChart tokenAddress={tokenAddress} />

              {/* Recent Transactions */}
              <RecentTrades
                tokenAddress={tokenAddress}
                tokenSymbol={token.symbol ?? "TOKEN"}
              />

              {/* Holders */}
              <TokenHolders
                tokenAddress={tokenAddress}
                tokenSymbol={token.symbol ?? "TOKEN"}
              />
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

// FDV = price_per_token_in_xyz * 100M total supply * xyz_usd_price
const TOTAL_TOKEN_SUPPLY = 100_000_000; // 100M tokens

function formatMarketCap(priceXyz: string, xyzPriceUsd: number): string {
  const fdvUsd = Number(priceXyz) * TOTAL_TOKEN_SUPPLY * xyzPriceUsd;
  return formatUsd(fdvUsd);
}

// Contract returns current_price as a decimal string in XYZ (e.g. "0.000001")
function formatDetailPrice(priceXyz: string, xyzPriceUsd: number): string {
  const usd = Number(priceXyz) * xyzPriceUsd;
  return formatUsd(usd);
}

function formatDetailVolume(volumeUxyz: string, xyzPriceUsd: number): string {
  const usd = (Number(volumeUxyz) / 1_000_000) * xyzPriceUsd;
  return formatUsd(usd);
}
