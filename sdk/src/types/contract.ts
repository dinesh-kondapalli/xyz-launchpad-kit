import type { TxResult, FeeConfig } from "./transaction.js";

// Generic contract message types
export type ContractMsg = Record<string, unknown>;
export type ContractQuery = Record<string, unknown>;

// Execute options
export interface ExecuteOptions extends FeeConfig {
  memo?: string;
  funds?: Array<{ denom: string; amount: string }>;
}

// Contract execution result (extends TxResult)
export interface ExecuteResult extends TxResult {
  events: ContractEvent[];
  data?: string; // base64 encoded response data
}

// Contract event
export interface ContractEvent {
  type: string;
  attributes: Array<{
    key: string;
    value: string;
  }>;
}

// CW20 specific message types
export interface CW20TransferMsg {
  transfer: {
    recipient: string;
    amount: string;
  };
}

export interface CW20MintMsg {
  mint: {
    recipient: string;
    amount: string;
  };
}

export interface CW20BurnMsg {
  burn: {
    amount: string;
  };
}

export interface CW20SendMsg {
  send: {
    contract: string;
    amount: string;
    msg: string; // base64 encoded message for receiving contract
  };
}

export interface CW20IncreaseAllowanceMsg {
  increase_allowance: {
    spender: string;
    amount: string;
    expires?: { at_height: number } | { at_time: string } | { never: object };
  };
}

// CW20 query types
export interface CW20BalanceQuery {
  balance: {
    address: string;
  };
}

export interface CW20TokenInfoQuery {
  token_info: object;
}

export interface CW20AllowanceQuery {
  allowance: {
    owner: string;
    spender: string;
  };
}
