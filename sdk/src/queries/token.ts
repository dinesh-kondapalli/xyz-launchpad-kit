import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { XYZClient } from "../client.js";
import type {
  TokenInfo,
  TokenBalance,
  TokenMarketingInfo,
  FormattedToken,
} from "../types/token.js";

// Cache CosmWasm client per RPC endpoint
const cwClientCache = new Map<string, CosmWasmClient>();

async function getCwClient(client: XYZClient): Promise<CosmWasmClient> {
  const endpoint = client.config.rpcEndpoint;
  let cwClient = cwClientCache.get(endpoint);
  if (!cwClient) {
    cwClient = await CosmWasmClient.connect(endpoint);
    cwClientCache.set(endpoint, cwClient);
  }
  return cwClient;
}

/**
 * Get CW20 token balance for an address
 */
export async function getTokenBalance(
  client: XYZClient,
  contractAddress: string,
  address: string
): Promise<string> {
  const cwClient = await getCwClient(client);
  const result = (await cwClient.queryContractSmart(contractAddress, {
    balance: { address },
  })) as TokenBalance;
  return result.balance;
}

/**
 * Get CW20 token info
 */
export async function getTokenInfo(
  client: XYZClient,
  contractAddress: string
): Promise<TokenInfo> {
  const cwClient = await getCwClient(client);
  return cwClient.queryContractSmart(contractAddress, {
    token_info: {},
  }) as Promise<TokenInfo>;
}

/**
 * Get CW20 token marketing info (if available)
 */
export async function getTokenMarketingInfo(
  client: XYZClient,
  contractAddress: string
): Promise<TokenMarketingInfo | null> {
  try {
    const cwClient = await getCwClient(client);
    return (await cwClient.queryContractSmart(contractAddress, {
      marketing_info: {},
    })) as TokenMarketingInfo;
  } catch {
    return null; // Marketing info is optional
  }
}

/**
 * Get formatted token info with human-readable values
 */
export async function getFormattedTokenInfo(
  client: XYZClient,
  contractAddress: string
): Promise<FormattedToken> {
  const info = await getTokenInfo(client, contractAddress);
  const divisor = BigInt(10 ** info.decimals);
  const supply = BigInt(info.total_supply);
  const whole = supply / divisor;
  const frac = supply % divisor;

  return {
    contractAddress,
    name: info.name,
    symbol: info.symbol,
    decimals: info.decimals,
    totalSupply: info.total_supply,
    formattedTotalSupply: `${whole}.${frac.toString().padStart(info.decimals, "0")}`,
  };
}
