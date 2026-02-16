import { REST_ENDPOINT } from "./chain-config";
import type { OracleResponse } from "./contract-clients/types";

const LAUNCHPAD_CONTRACT = process.env.NEXT_PUBLIC_LAUNCHPAD_CONTRACT!;

export interface TokenListItem {
  address: string;
  name: string | null;
  symbol: string | null;
  image: string | null;
  description: string | null;
  creator: string | null;
  source: string;
  graduated: boolean;
  created_at: string | null;
  first_seen_at: string;
  current_price: string;
  xyz_reserves: string;
  volume_24h: string;
  trade_count_24h: number;
}

interface CurveData {
  token_address: string;
  metadata: {
    name: string;
    symbol: string;
    image: string;
    description: string;
    social_links: string[];
  };
  creator: string;
  tokens_sold: string;
  tokens_remaining: string;
  xyz_reserves: string;
  current_price: string;
  graduated: boolean;
  created_at: number;
}

async function queryContract<T>(msg: Record<string, unknown>): Promise<T> {
  const encoded = btoa(JSON.stringify(msg));
  const res = await fetch(
    `${REST_ENDPOINT}/cosmwasm/wasm/v1/contract/${LAUNCHPAD_CONTRACT}/smart/${encoded}`
  );
  if (!res.ok) throw new Error(`Contract query failed: ${res.status}`);
  const json = await res.json();
  return json.data as T;
}

function curveToTokenListItem(curve: CurveData): TokenListItem {
  return {
    address: curve.token_address,
    name: curve.metadata.name,
    symbol: curve.metadata.symbol,
    image: curve.metadata.image || null,
    description: curve.metadata.description || null,
    creator: curve.creator,
    source: "launchpad",
    graduated: curve.graduated,
    created_at: curve.created_at ? new Date(curve.created_at * 1000).toISOString() : null,
    first_seen_at: curve.created_at ? new Date(curve.created_at * 1000).toISOString() : new Date().toISOString(),
    current_price: curve.current_price,
    xyz_reserves: curve.xyz_reserves,
    volume_24h: "0",
    trade_count_24h: 0,
  };
}

export async function fetchTokens(): Promise<TokenListItem[]> {
  const data = await queryContract<{ curves: CurveData[] }>({
    all_curves: { start_after: null, limit: 50 },
  });
  return data.curves.map(curveToTokenListItem);
}

export async function fetchToken(address: string): Promise<TokenListItem> {
  const data = await queryContract<CurveData>({
    curve: { token_address: address },
  });
  return curveToTokenListItem(data);
}

// --- Candle data (Phase 38) ---

export type Timeframe = '1m' | '5m' | '1h' | '1d';

export interface CandleResponse {
  token_address: string;
  timeframe: Timeframe;
  candles: Array<{
    time: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    trade_count: number;
  }>;
}

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "1h": 3600,
  "1d": 86400,
};

export async function fetchCandles(
  tokenAddress: string,
  timeframe: Timeframe,
  limit: number = 300,
): Promise<CandleResponse> {
  // Build candles from on-chain trade events
  const trades = await fetchAllTradeEvents(tokenAddress);

  // Get current price from curve as a fallback / latest point
  let currentPriceUxyz = 0;
  try {
    const curve = await queryContract<CurveData>({
      curve: { token_address: tokenAddress },
    });
    // current_price from contract is a decimal string in XYZ (e.g. "0.000001")
    // Convert to uxyz for internal candle math
    currentPriceUxyz = Number(curve.current_price) * 1_000_000;
  } catch {
    // ignore
  }

  // Build price points from trades
  interface PricePoint {
    time: number; // unix seconds
    price: number; // uxyz per token
    volume: number; // uxyz
  }

  const points: PricePoint[] = [];

  for (const trade of trades) {
    const timeSec = Math.floor(new Date(trade.time).getTime() / 1000);
    const xyz = Number(trade.xyz_amount);
    const tokens = Number(trade.token_amount);
    if (tokens === 0) continue;
    // price in uxyz per token = (xyz_uxyz / token_micro) * 1e6
    const price = (xyz / tokens) * 1e6;
    points.push({ time: timeSec, price, volume: xyz });
  }

  // Sort ascending by time
  points.sort((a, b) => a.time - b.time);

  // Add current price as latest point if we have curve data
  if (currentPriceUxyz > 0) {
    const now = Math.floor(Date.now() / 1000);
    points.push({ time: now, price: currentPriceUxyz, volume: 0 });
  }

  if (points.length === 0) {
    return { token_address: tokenAddress, timeframe, candles: [] };
  }

  // Bucket into candles
  const interval = TIMEFRAME_SECONDS[timeframe];
  const buckets = new Map<number, PricePoint[]>();

  for (const pt of points) {
    const bucket = Math.floor(pt.time / interval) * interval;
    const arr = buckets.get(bucket);
    if (arr) arr.push(pt);
    else buckets.set(bucket, [pt]);
  }

  // Build OHLCV candles
  const candles: CandleResponse["candles"] = [];
  const sortedBuckets = [...buckets.keys()].sort((a, b) => a - b);

  let prevClose = "0";
  for (const bucketTime of sortedBuckets) {
    const pts = buckets.get(bucketTime)!;
    const open = pts[0].price;
    const close = pts[pts.length - 1].price;
    let high = open;
    let low = open;
    let vol = 0;

    for (const p of pts) {
      if (p.price > high) high = p.price;
      if (p.price < low) low = p.price;
      vol += p.volume;
    }

    const candle = {
      time: new Date(bucketTime * 1000).toISOString(),
      open: String(Math.round(open)),
      high: String(Math.round(high)),
      low: String(Math.round(low)),
      close: String(Math.round(close)),
      volume: String(Math.round(vol)),
      trade_count: pts.filter((p) => p.volume > 0).length,
    };

    // Fill gaps with flat candles (cap at 20 to avoid huge fills on sparse data)
    if (prevClose !== "0" && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const lastTime = Math.floor(new Date(lastCandle.time).getTime() / 1000);
      const gapCount = Math.floor((bucketTime - lastTime) / interval) - 1;
      const fillCount = Math.min(gapCount, 20);
      for (let i = 1; i <= fillCount; i++) {
        const t = lastTime + interval * i;
        candles.push({
          time: new Date(t * 1000).toISOString(),
          open: prevClose,
          high: prevClose,
          low: prevClose,
          close: prevClose,
          volume: "0",
          trade_count: 0,
        });
      }
    }

    candles.push(candle);
    prevClose = candle.close;
  }

  return {
    token_address: tokenAddress,
    timeframe,
    candles: candles.slice(-limit),
  };
}

/**
 * Fetch all buy+sell trade events for a token (for candle building).
 * Returns combined trades sorted by time.
 */
async function fetchAllTradeEvents(
  tokenAddress: string
): Promise<Array<{ time: string; xyz_amount: string; token_amount: string; action: string }>> {
  const [buyTxs, sellTxs] = await Promise.all([
    searchTxByEvents(
      [`wasm.action='buy'`, `wasm.token_address='${tokenAddress}'`],
      100
    ),
    searchTxByEvents(
      [`wasm.action='sell'`, `wasm.token_address='${tokenAddress}'`],
      100
    ),
  ]);

  const trades: Array<{ time: string; xyz_amount: string; token_amount: string; action: string }> = [];

  for (const tx of buyTxs) {
    const attrs = extractWasmAttrs(tx, "buy");
    if (attrs) {
      trades.push({
        time: tx.timestamp || new Date().toISOString(),
        xyz_amount: attrs.xyz_input || "0",
        token_amount: attrs.tokens_out || "0",
        action: "buy",
      });
    }
  }

  for (const tx of sellTxs) {
    const attrs = extractWasmAttrs(tx, "sell");
    if (attrs) {
      trades.push({
        time: tx.timestamp || new Date().toISOString(),
        xyz_amount: attrs.xyz_out || "0",
        token_amount: attrs.tokens_input || "0",
        action: "sell",
      });
    }
  }

  return trades;
}

// --- Recent trades (Phase 39) ---

export interface RecentTrade {
  time: string;
  tx_hash: string;
  source: string;
  action: string;
  direction: string;
  token_address: string;
  price_uxyz: string;
  volume_uxyz: string;
  volume_token: string;
  fee_uxyz: string;
  trader: string;
  token_name: string | null;
  token_symbol: string | null;
}

export const RECENT_TRADES_QUERY_KEY = ["trades", "recent"] as const;

export async function fetchRecentTrades(limit: number = 50): Promise<RecentTrade[]> {
  // No backend — return empty trades for now
  return [];
}

// --- Token-specific trades from chain tx search ---

export interface TokenTrade {
  time: string;
  tx_hash: string;
  action: "buy" | "sell";
  trader: string;
  xyz_amount: string;   // uxyz
  token_amount: string;  // micro-tokens
  fee: string;           // uxyz
}

export const TOKEN_TRADES_QUERY_KEY = (address: string) =>
  ["trades", "token", address] as const;

/**
 * Fetch buy/sell transactions for a specific token from the chain's tx search.
 * Queries CometBFT-indexed wasm events.
 */
export async function fetchTokenTrades(
  tokenAddress: string,
  limit: number = 20
): Promise<TokenTrade[]> {
  const trades: TokenTrade[] = [];

  // Query buys and sells in parallel
  const [buyTxs, sellTxs] = await Promise.all([
    searchTxByEvents(
      [`wasm.action='buy'`, `wasm.token_address='${tokenAddress}'`],
      limit
    ),
    searchTxByEvents(
      [`wasm.action='sell'`, `wasm.token_address='${tokenAddress}'`],
      limit
    ),
  ]);

  for (const tx of buyTxs) {
    const attrs = extractWasmAttrs(tx, "buy");
    if (attrs) {
      trades.push({
        time: tx.timestamp || new Date().toISOString(),
        tx_hash: tx.txhash,
        action: "buy",
        trader: attrs.buyer || "",
        xyz_amount: attrs.xyz_input || "0",
        token_amount: attrs.tokens_out || "0",
        fee: attrs.fee || "0",
      });
    }
  }

  for (const tx of sellTxs) {
    const attrs = extractWasmAttrs(tx, "sell");
    if (attrs) {
      trades.push({
        time: tx.timestamp || new Date().toISOString(),
        tx_hash: tx.txhash,
        action: "sell",
        trader: attrs.seller || "",
        xyz_amount: attrs.xyz_out || "0",
        token_amount: attrs.tokens_input || "0",
        fee: attrs.fee_burned || "0",
      });
    }
  }

  // Sort by time descending
  trades.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return trades.slice(0, limit);
}

interface TxResponse {
  txhash: string;
  timestamp: string;
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
  logs?: Array<{ events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }> }>;
}

async function searchTxByEvents(
  events: string[],
  limit: number
): Promise<TxResponse[]> {
  try {
    // Cosmos SDK REST API uses a single "query" param with AND-joined conditions
    const query = events.join(" AND ");
    const params = new URLSearchParams();
    params.set("query", query);
    params.set("order_by", "ORDER_BY_DESC");
    params.set("pagination.limit", String(limit));

    const res = await fetch(
      `${REST_ENDPOINT}/cosmos/tx/v1beta1/txs?${params.toString()}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.tx_responses || []) as TxResponse[];
  } catch {
    return [];
  }
}

function extractWasmAttrs(
  tx: TxResponse,
  action: string
): Record<string, string> | null {
  // Try top-level events first (Cosmos SDK 0.47+)
  for (const ev of tx.events || []) {
    if (ev.type === "wasm") {
      const map: Record<string, string> = {};
      for (const attr of ev.attributes) {
        map[attr.key] = attr.value;
      }
      if (map.action === action) return map;
    }
  }
  // Fallback: check logs (older SDK versions)
  for (const log of tx.logs || []) {
    for (const ev of log.events || []) {
      if (ev.type === "wasm") {
        const map: Record<string, string> = {};
        for (const attr of ev.attributes) {
          map[attr.key] = attr.value;
        }
        if (map.action === action) return map;
      }
    }
  }
  return null;
}

// --- Token holders (CW20 queries) ---

export interface TokenHolder {
  address: string;
  balance: string; // micro-tokens
}

export const TOKEN_HOLDERS_QUERY_KEY = (address: string) =>
  ["holders", address] as const;

async function queryCw20<T>(tokenAddress: string, msg: Record<string, unknown>): Promise<T> {
  const encoded = btoa(JSON.stringify(msg));
  const res = await fetch(
    `${REST_ENDPOINT}/cosmwasm/wasm/v1/contract/${tokenAddress}/smart/${encoded}`
  );
  if (!res.ok) throw new Error(`CW20 query failed: ${res.status}`);
  const json = await res.json();
  return json.data as T;
}

export async function fetchTokenHolders(tokenAddress: string): Promise<TokenHolder[]> {
  // Get all accounts from the CW20 token contract
  const holders: TokenHolder[] = [];
  let startAfter: string | null = null;

  // Paginate through all accounts (max ~5 pages to avoid excessive queries)
  for (let page = 0; page < 5; page++) {
    const accountsResult: { accounts: string[] } = await queryCw20(tokenAddress, {
      all_accounts: { start_after: startAfter, limit: 30 },
    });

    if (accountsResult.accounts.length === 0) break;

    // Batch query balances
    const balancePromises = accountsResult.accounts.map((addr) =>
      queryCw20<{ balance: string }>(tokenAddress, {
        balance: { address: addr },
      }).then((bal) => ({ address: addr, balance: bal.balance }))
    );

    const results = await Promise.all(balancePromises);
    holders.push(...results.filter((h) => h.balance !== "0"));

    if (accountsResult.accounts.length < 30) break;
    startAfter = accountsResult.accounts[accountsResult.accounts.length - 1];
  }

  // Sort by balance descending
  holders.sort((a, b) => Number(b.balance) - Number(a.balance));

  return holders;
}

// --- Bonding curve progress ---

export interface CurveProgress {
  tokens_sold: string;
  tokens_remaining: string;
  xyz_reserves: string;
  graduation_threshold: string;
  progress_percent: number;
  current_price: string;
  graduated: boolean;
}

export async function fetchCurveProgress(
  tokenAddress: string
): Promise<CurveProgress> {
  const data = await queryContract<{
    token_address: string;
    xyz_raised: string;
    graduation_threshold: string;
    progress_percent: string;
    tokens_sold: string;
    tokens_remaining: string;
    graduated: boolean;
  }>({
    progress: { token_address: tokenAddress },
  });

  // Also get current price from the curve query
  const curve = await queryContract<CurveData>({
    curve: { token_address: tokenAddress },
  });

  return {
    tokens_sold: data.tokens_sold,
    tokens_remaining: data.tokens_remaining,
    xyz_reserves: data.xyz_raised,
    graduation_threshold: data.graduation_threshold,
    progress_percent: parseFloat(data.progress_percent) || 0,
    current_price: curve.current_price,
    graduated: data.graduated,
  };
}

// --- Oracle state query ---

export async function fetchOracleState(): Promise<OracleResponse> {
  return queryContract<OracleResponse>({ oracle: {} });
}
