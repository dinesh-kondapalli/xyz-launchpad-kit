import { NextResponse } from "next/server";

const XYZ_MINT = process.env.XYZ_SOL_MINT ?? "F5vD6HL4e5kbKE9VPa767dupGdBpcKXYdqkxCZiuqQEb";
const REST_ENDPOINT =
  process.env.NEXT_PUBLIC_REST_ENDPOINT ?? "http://67.205.164.156:1317";
const LAUNCHPAD_CONTRACT = process.env.NEXT_PUBLIC_LAUNCHPAD_CONTRACT!;

interface PriceResult {
  price: number;
  source: "dexscreener" | "pumpfun" | "oracle";
}

async function tryDexScreener(): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${XYZ_MINT}`,
      { next: { revalidate: 30 } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.pairs?.length > 0) {
      const price = parseFloat(data.pairs[0].priceUsd);
      if (price > 0) return price;
    }
  } catch {}
  return null;
}

async function tryPumpFun(): Promise<number | null> {
  try {
    const res = await fetch(
      `https://frontend-api-v3.pump.fun/coins/${XYZ_MINT}`,
      { next: { revalidate: 30 } },
    );
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    const data = JSON.parse(text);
    if (data?.usd_market_cap && data?.total_supply) {
      // pump.fun total_supply is in smallest units (6 decimals)
      const price = data.usd_market_cap / (data.total_supply / 1e6);
      if (price > 0) return price;
    }
  } catch {}
  return null;
}

async function tryOracle(): Promise<number | null> {
  try {
    const msg = btoa(JSON.stringify({ oracle: {} }));
    const res = await fetch(
      `${REST_ENDPOINT}/cosmwasm/wasm/v1/contract/${LAUNCHPAD_CONTRACT}/smart/${msg}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const price = Number(json.data?.xyz_usd_price) / 1_000_000;
    if (price > 0) return price;
  } catch {}
  return null;
}

export async function GET() {
  // Try sources in priority order
  let result: PriceResult | null = null;

  const dex = await tryDexScreener();
  if (dex !== null) {
    result = { price: dex, source: "dexscreener" };
  }

  if (!result) {
    const pf = await tryPumpFun();
    if (pf !== null) {
      result = { price: pf, source: "pumpfun" };
    }
  }

  if (!result) {
    const oracle = await tryOracle();
    if (oracle !== null) {
      result = { price: oracle, source: "oracle" };
    }
  }

  if (!result) {
    result = { price: 1, source: "oracle" };
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
