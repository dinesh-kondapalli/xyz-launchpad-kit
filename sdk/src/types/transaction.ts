import type { DeliverTxResponse } from "@cosmjs/stargate";

// Re-export CosmJS types for convenience
export type { DeliverTxResponse };

// Simplified transaction result
export interface TxResult {
  transactionHash: string;
  height: number;
  gasUsed: number;
  gasWanted: number;
  code: number; // 0 = success
  rawLog?: string;
}

// Fee configuration
export interface FeeConfig {
  gas?: string; // default: "auto"
  gasPrice?: string; // default: "0.025uxyz"
  gasAdjustment?: number; // default: 1.3
}

// Send options
export interface SendOptions extends FeeConfig {
  memo?: string;
}

// Convert DeliverTxResponse to simplified TxResult
export function toTxResult(response: DeliverTxResponse): TxResult {
  return {
    transactionHash: response.transactionHash,
    height: response.height,
    gasUsed: Number(response.gasUsed),
    gasWanted: Number(response.gasWanted),
    code: response.code,
    rawLog: response.rawLog,
  };
}
