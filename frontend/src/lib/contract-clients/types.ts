// Response types for Launchpad contract (from contracts/launchpad/src/msg.rs)

export interface TokenMetadata {
  name: string;
  symbol: string;
  image: string;
  description: string;
  social_links: string[];
}

export interface SimulateBuyResponse {
  tokens_out: string;
  fee_amount: string;
  new_price: string;
}

export interface SimulateSellResponse {
  xyz_out: string;
  fee_amount: string;
  burned_amount: string;
  new_price: string;
}

export interface CurveResponse {
  token_address: string;
  metadata: TokenMetadata;
  creator: string;
  tokens_sold: string;
  tokens_remaining: string;
  xyz_reserves: string;
  current_price: string;
  graduated: boolean;
  created_at: number;
}

export interface ProgressResponse {
  token_address: string;
  xyz_raised: string;
  graduation_threshold: string;
  progress_percent: string;
  tokens_sold: string;
  tokens_remaining: string;
  graduated: boolean;
}

export interface LaunchpadConfigResponse {
  amm_contract: string;
  cw20_code_id: number;
  creation_fee: string;
  graduation_threshold: string;
  buy_fee_bps: number;
  sell_fee_bps: number;
}

// Response types for AMM contract (from contracts/amm/src/msg.rs)

export interface SimulateSwapResponse {
  output_amount: string;
  fee_amount: string;
  price_impact: string;
  augmented_fee_amount: string;
}

export interface PoolResponse {
  token_address: string;
  xyz_reserve: string;
  token_reserve: string;
  lp_token_address: string;
  lp_total_supply: string;
  price: string;
}

export interface OracleResponse {
  xyz_usd_price: string;       // Uint128 as string (micro-USD, 6 decimals)
  last_update_height: number;
  last_update_timestamp: number;
}
