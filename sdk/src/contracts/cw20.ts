import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { XYZClient } from "../client.js";
import type { ExecuteOptions, ExecuteResult } from "../types/contract.js";
import type { TokenInfo, TokenBalance } from "../types/token.js";
import { queryContract } from "./query.js";
import { executeContract } from "./execute.js";

// ============ CW20 Queries ============

/**
 * Get CW20 token balance
 */
export async function getCW20Balance(
  client: XYZClient,
  tokenAddress: string,
  ownerAddress: string
): Promise<string> {
  const result = await queryContract<TokenBalance>(client, tokenAddress, {
    balance: { address: ownerAddress },
  });
  return result.balance;
}

/**
 * Get CW20 token info
 */
export async function getCW20TokenInfo(
  client: XYZClient,
  tokenAddress: string
): Promise<TokenInfo> {
  return queryContract<TokenInfo>(client, tokenAddress, {
    token_info: {},
  });
}

/**
 * Get CW20 allowance
 */
export async function getCW20Allowance(
  client: XYZClient,
  tokenAddress: string,
  owner: string,
  spender: string
): Promise<{ allowance: string; expires: unknown }> {
  return queryContract(client, tokenAddress, {
    allowance: { owner, spender },
  });
}

// ============ CW20 Executions ============

/**
 * Transfer CW20 tokens
 */
export async function transferCW20(
  contractClient: SigningCosmWasmClient,
  senderAddress: string,
  tokenAddress: string,
  recipient: string,
  amount: string,
  options?: ExecuteOptions
): Promise<ExecuteResult> {
  return executeContract(
    contractClient,
    senderAddress,
    tokenAddress,
    {
      transfer: { recipient, amount },
    },
    options
  );
}

/**
 * Mint CW20 tokens (requires minter permission)
 */
export async function mintCW20(
  contractClient: SigningCosmWasmClient,
  senderAddress: string,
  tokenAddress: string,
  recipient: string,
  amount: string,
  options?: ExecuteOptions
): Promise<ExecuteResult> {
  return executeContract(
    contractClient,
    senderAddress,
    tokenAddress,
    {
      mint: { recipient, amount },
    },
    options
  );
}

/**
 * Burn CW20 tokens
 */
export async function burnCW20(
  contractClient: SigningCosmWasmClient,
  senderAddress: string,
  tokenAddress: string,
  amount: string,
  options?: ExecuteOptions
): Promise<ExecuteResult> {
  return executeContract(
    contractClient,
    senderAddress,
    tokenAddress,
    {
      burn: { amount },
    },
    options
  );
}

/**
 * Send CW20 tokens to a contract with a message
 */
export async function sendCW20(
  contractClient: SigningCosmWasmClient,
  senderAddress: string,
  tokenAddress: string,
  contractAddress: string,
  amount: string,
  msg: object,
  options?: ExecuteOptions
): Promise<ExecuteResult> {
  const encodedMsg = Buffer.from(JSON.stringify(msg)).toString("base64");
  return executeContract(
    contractClient,
    senderAddress,
    tokenAddress,
    {
      send: {
        contract: contractAddress,
        amount,
        msg: encodedMsg,
      },
    },
    options
  );
}

/**
 * Increase CW20 allowance
 */
export async function increaseAllowanceCW20(
  contractClient: SigningCosmWasmClient,
  senderAddress: string,
  tokenAddress: string,
  spender: string,
  amount: string,
  options?: ExecuteOptions
): Promise<ExecuteResult> {
  return executeContract(
    contractClient,
    senderAddress,
    tokenAddress,
    {
      increase_allowance: { spender, amount },
    },
    options
  );
}
