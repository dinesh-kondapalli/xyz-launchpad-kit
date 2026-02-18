"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useCandles } from "@/hooks/use-candles";
import { TradingChartCanvas } from "./trading-chart-canvas";
import { TradingChartSkeleton } from "./trading-chart-skeleton";
import {
  IndicatorToolbar,
  DEFAULT_INDICATORS,
  type ActiveIndicators,
} from "./indicator-toolbar";
import type { Timeframe } from "@/lib/api";

interface TradingChartProps {
  tokenAddress: string;
}

export function TradingChart({ tokenAddress }: TradingChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [indicators, setIndicators] =
    useState<ActiveIndicators>(DEFAULT_INDICATORS);
  const [showMCap, setShowMCap] = useState(true);
  const { data, isLoading, error, refetch } = useCandles(
    tokenAddress,
    timeframe,
  );

  if (isLoading) {
    return <TradingChartSkeleton />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Price Chart</h2>
        </div>
        <div className="flex h-[400px] items-center justify-center rounded-2xl border border-zinc-800 bg-pink-950/30">
          <div className="text-center space-y-2">
            <p className="font-medium text-pink-300">
              Failed to load chart
            </p>
            <p className="text-sm text-zinc-500">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasData = data && data.candles.length > 0;

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Tabs
            value={timeframe}
            onValueChange={(v) => setTimeframe(v as Timeframe)}
          >
            <TabsList>
              <TabsTrigger value="1m">1m</TabsTrigger>
              <TabsTrigger value="5m">5m</TabsTrigger>
              <TabsTrigger value="1h">1h</TabsTrigger>
              <TabsTrigger value="1d">1d</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Price / MCap toggle */}
            <div className="flex items-center text-xs font-medium">
              <button
                type="button"
                onClick={() => setShowMCap(false)}
                className={`px-2 py-1 rounded-l transition-colors ${
                  !showMCap
                    ? "bg-pink-900/35 text-pink-100"
                    : "bg-zinc-950 text-zinc-500 hover:text-zinc-100"
                }`}
              >
                Price
            </button>
            <button
              type="button"
                onClick={() => setShowMCap(true)}
                className={`px-2 py-1 rounded-r transition-colors ${
                  showMCap
                    ? "bg-pink-900/35 text-pink-100"
                    : "bg-zinc-950 text-zinc-500 hover:text-zinc-100"
                }`}
              >
                MCap
            </button>
          </div>
        </div>
      </div>

      <IndicatorToolbar indicators={indicators} onChange={setIndicators} />

      {hasData ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-900 bg-[#050505]">
          <TradingChartCanvas
            data={data}
            indicators={indicators}
            showMCap={showMCap}
          />
        </div>
      ) : (
        <div className="flex h-[400px] items-center justify-center rounded-2xl border border-zinc-900 bg-[#050505]">
          <div className="text-center space-y-2">
            <p className="text-zinc-500">
              No trading data available yet
            </p>
            <p className="text-sm text-zinc-600">
              Chart will appear after first trade
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
