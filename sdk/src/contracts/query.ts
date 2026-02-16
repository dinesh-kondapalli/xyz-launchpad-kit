import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { XYZClient } from "../client.js";
import type { ContractQuery } from "../types/contract.js";

// Cache CosmWasm clients
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
 * Query a smart contract
 * @param client - XYZ client instance
 * @param contractAddress - Contract address (xyz1...)
 * @param queryMsg - Query message (e.g., { balance: { address: "xyz1..." } })
 * @returns Query result (type depends on contract)
 */
export async function queryContract<T = unknown>(
  client: XYZClient,
  contractAddress: string,
  queryMsg: ContractQuery
): Promise<T> {
  const cwClient = await getCwClient(client);
  return cwClient.queryContractSmart(contractAddress, queryMsg) as Promise<T>;
}

/**
 * Get contract info (code_id, creator, admin, label)
 */
export async function getContractInfo(
  client: XYZClient,
  contractAddress: string
): Promise<{
  codeId: number;
  creator: string;
  admin?: string;
  label: string;
}> {
  const cwClient = await getCwClient(client);
  const info = await cwClient.getContract(contractAddress);
  return {
    codeId: info.codeId,
    creator: info.creator,
    admin: info.admin,
    label: info.label,
  };
}

/**
 * Get raw contract state by key
 */
export async function getContractState(
  client: XYZClient,
  contractAddress: string,
  key: Uint8Array
): Promise<Uint8Array | null> {
  const cwClient = await getCwClient(client);
  return cwClient.queryContractRaw(contractAddress, key);
}
