import { NextResponse } from "next/server";

const REST_ENDPOINT =
  process.env.NEXT_PUBLIC_REST_ENDPOINT ?? "http://67.205.164.156:1317";
const LAUNCHPAD_CONTRACT = process.env.NEXT_PUBLIC_LAUNCHPAD_CONTRACT!;

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
  const price = await tryOracle();

  if (price === null) {
    return NextResponse.json(
      { error: "Failed to fetch price from oracle" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { price, source: "oracle" },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
