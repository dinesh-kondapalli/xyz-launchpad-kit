import { executeContract, queryContract, sendCW20 } from "@xyz-chain/sdk";
import type { XYZClient } from "@xyz-chain/sdk";
import type { ExecuteResult } from "@xyz-chain/sdk";
import type { SimulateSwapResponse, PoolResponse } from "./types";

const AMM_CONTRACT = process.env.NEXT_PUBLIC_AMM_CONTRACT!;

/**
 * Query: Simulate a swap to get expected output and price impact
 */
export async function simulateSwap(
  client: XYZClient,
  tokenAddress: string,
  offerXyz: boolean,
  offerAmount: string
): Promise<SimulateSwapResponse> {
  return queryContract<SimulateSwapResponse>(client, AMM_CONTRACT, {
    simulate_swap: {
      token_address: tokenAddress,
      offer_xyz: offerXyz,
      offer_amount: offerAmount,
    },
  });
}

/**
 * Query: Get pool info for a token
 */
export async function getPool(
  client: XYZClient,
  tokenAddress: string
): Promise<PoolResponse> {
  return queryContract<PoolResponse>(client, AMM_CONTRACT, {
    pool: { token_address: tokenAddress },
  });
}

/**
 * Execute: Swap XYZ for tokens (buy direction)
 * Sends native XYZ as funds
 */
export async function swapXyzForToken(
  contractClient: any,
  senderAddress: string,
  tokenAddress: string,
  xyzAmount: string,
  minOutput: string
): Promise<ExecuteResult> {
  return executeContract(
    contractClient,
    senderAddress,
    AMM_CONTRACT,
    {
      swap: {
        token_address: tokenAddress,
        offer_xyz: true,
        min_output: minOutput,
      },
    },
    {
      funds: [{ denom: "uxyz", amount: xyzAmount }],
    }
  );
}

/**
 * Execute: Swap tokens for XYZ (sell direction)
 * Uses CW20 Send pattern -- sends tokens to AMM contract with SwapTokenForXyz message
 * IMPORTANT: Token->XYZ swaps must go through CW20 Send, not direct ExecuteMsg::Swap.
 */
export async function swapTokenForXyz(
  contractClient: any,
  senderAddress: string,
  tokenAddress: string,
  tokenAmount: string,
  minOutput: string
): Promise<ExecuteResult> {
  return sendCW20(
    contractClient,
    senderAddress,
    tokenAddress,
    AMM_CONTRACT,
    tokenAmount,
    { min_output: minOutput }
  );
}
