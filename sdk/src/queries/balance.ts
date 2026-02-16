import type { XYZClient } from "../client.js";
import type { Coin } from "../types/coin.js";
import { XYZ_DENOM } from "../types/coin.js";

/**
 * Get native XYZ balance for an address
 */
export async function getBalance(
  client: XYZClient,
  address: string
): Promise<Coin> {
  const coin = await client.stargate.getBalance(address, XYZ_DENOM);
  return {
    denom: coin.denom,
    amount: coin.amount,
  };
}

/**
 * Get all native token balances for an address
 */
export async function getAllBalances(
  client: XYZClient,
  address: string
): Promise<readonly Coin[]> {
  const balances = await client.stargate.getAllBalances(address);
  return balances.map((b) => ({ denom: b.denom, amount: b.amount }));
}
