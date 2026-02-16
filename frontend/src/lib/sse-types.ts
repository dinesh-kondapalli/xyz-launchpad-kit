// MUST match backend/src/api/sse/channels.ts interfaces exactly

export interface TradeSSEEvent {
  token_address: string;
  action: string;        // 'buy' | 'sell' | 'swap' | 'buy_and_graduate'
  direction: string;     // 'buy' | 'sell' | 'xyz_to_token' | 'token_to_xyz'
  input_amount: string;
  output_amount: string;
  price_uxyz: string;
  trader: string;
  tx_hash: string;
  time: string;
  xyz_reserves: string;  // Added in Plan 36-01
}

export interface TokenLaunchSSEEvent {
  token_address: string;
  creator: string;
  initial_reserves: string;
  time: string;
}

export interface GraduationSSEEvent {
  token_address: string;
  xyz_for_pool: string;
  tokens_for_pool: string;
  creator: string;
  time: string;
}
