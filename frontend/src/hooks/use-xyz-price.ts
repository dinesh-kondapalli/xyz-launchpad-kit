"use client";

import { useQuery } from "@tanstack/react-query";

export const XYZ_PRICE_QUERY_KEY = ["xyz-price"] as const;

interface PriceResponse {
  price: number;
  source: "oracle";
}

async function fetchXyzPrice(): Promise<PriceResponse> {
  const res = await fetch("/api/xyz-price");
  if (!res.ok) throw new Error("Failed to fetch XYZ price");
  return res.json();
}

export function useXyzPrice() {
  const query = useQuery({
    queryKey: [...XYZ_PRICE_QUERY_KEY],
    queryFn: fetchXyzPrice,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return {
    ...query,
    /** XYZ price in USD (e.g., 0.00001). Defaults to 1 while loading. */
    xyzPriceUsd: query.data?.price ?? 1,
    /** Where the price came from */
    priceSource: query.data?.source ?? "oracle",
  };
}
