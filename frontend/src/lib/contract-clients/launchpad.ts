import { executeContract, queryContract, sendCW20 } from "@xyz-chain/sdk";
import type { XYZClient } from "@xyz-chain/sdk";
import type { ExecuteResult } from "@xyz-chain/sdk";
import type {
  SimulateBuyResponse,
  SimulateSellResponse,
  CurveResponse,
  LaunchpadConfigResponse,
} from "./types";

const LAUNCHPAD_CONTRACT = process.env.NEXT_PUBLIC_LAUNCHPAD_CONTRACT!;
type ContractClient = Parameters<typeof executeContract>[0];

/**
 * Query: Simulate a buy transaction to get expected output
 */
export async function simulateBuy(
  client: XYZClient,
  tokenAddress: string,
  xyzAmount: string
): Promise<SimulateBuyResponse> {
  return queryContract<SimulateBuyResponse>(client, LAUNCHPAD_CONTRACT, {
    simulate_buy: {
      token_address: tokenAddress,
      xyz_amount: xyzAmount,
    },
  });
}

/**
 * Query: Simulate a sell transaction to get expected output
 */
export async function simulateSell(
  client: XYZClient,
  tokenAddress: string,
  tokenAmount: string
): Promise<SimulateSellResponse> {
  return queryContract<SimulateSellResponse>(client, LAUNCHPAD_CONTRACT, {
    simulate_sell: {
      token_address: tokenAddress,
      token_amount: tokenAmount,
    },
  });
}

/**
 * Query: Get curve data for a token
 */
export async function getCurve(
  client: XYZClient,
  tokenAddress: string
): Promise<CurveResponse> {
  return queryContract<CurveResponse>(client, LAUNCHPAD_CONTRACT, {
    curve: { token_address: tokenAddress },
  });
}

/**
 * Query: Get launchpad config (creation fee, graduation threshold, etc.)
 */
export async function getConfig(
  client: XYZClient
): Promise<LaunchpadConfigResponse> {
  return queryContract<LaunchpadConfigResponse>(client, LAUNCHPAD_CONTRACT, {
    config: {},
  });
}

/**
 * Execute: Buy tokens on bonding curve
 * Sends native XYZ as funds attached to the message
 */
export async function buyTokens(
  contractClient: ContractClient,
  senderAddress: string,
  tokenAddress: string,
  xyzAmount: string,
  minTokensOut: string
): Promise<ExecuteResult> {
  return executeContract(
    contractClient,
    senderAddress,
    LAUNCHPAD_CONTRACT,
    {
      buy: {
        token_address: tokenAddress,
        min_tokens_out: minTokensOut,
      },
    },
    {
      funds: [{ denom: "uxyz", amount: xyzAmount }],
    }
  );
}

/**
 * Execute: Sell tokens back to bonding curve
 * Uses CW20 Send pattern -- sends tokens to launchpad contract with SellTokens message
 * IMPORTANT: Do NOT try to call a direct "sell" ExecuteMsg -- it does not exist.
 * The launchpad uses Receive(Cw20ReceiveMsg) which decodes SellTokens from the inner msg.
 */
export async function sellTokens(
  contractClient: ContractClient,
  senderAddress: string,
  tokenAddress: string,
  tokenAmount: string,
  minXyzOut: string
): Promise<ExecuteResult> {
  return sendCW20(
    contractClient,
    senderAddress,
    tokenAddress,
    LAUNCHPAD_CONTRACT,
    tokenAmount,
    { min_xyz_out: minXyzOut }
  );
}

/**
 * Execute: Create new token launch on bonding curve
 * Requires creation fee in uxyz (query getConfig for current fee)
 */
export async function createToken(
  contractClient: ContractClient,
  senderAddress: string,
  params: {
    name: string;
    symbol: string;
    image: string;
    description: string;
    socialLinks: string[];
  },
  creationFee: string
): Promise<ExecuteResult> {
  return executeContract(
    contractClient,
    senderAddress,
    LAUNCHPAD_CONTRACT,
    {
      create_token: {
        name: params.name,
        symbol: params.symbol,
        image: params.image,
        description: params.description,
        social_links: params.socialLinks,
      },
    },
    {
      funds: [{ denom: "uxyz", amount: creationFee }],
    }
  );
}
