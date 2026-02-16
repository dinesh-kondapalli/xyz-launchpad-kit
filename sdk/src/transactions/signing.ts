import { SigningStargateClient, GasPrice, calculateFee, type StdFee } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import type { XYZChainConfig } from "../types/chain.js";
import type { FeeConfig } from "../types/transaction.js";

const DEFAULT_GAS_PRICE = "0.025uxyz";
const DEFAULT_GAS_ADJUSTMENT = 1.3;

export interface XYZSigningClient {
  readonly address: string;
  readonly signingClient: SigningStargateClient;
  disconnect(): void;
}

/**
 * Create a signing client from a mnemonic
 * Use for server-side or CLI operations
 */
export async function createSigningClient(
  config: XYZChainConfig,
  mnemonic: string
): Promise<XYZSigningClient> {
  // Create wallet from mnemonic
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
    mnemonic,
    { prefix: config.prefix ?? "xyz" }
  );

  const [account] = await wallet.getAccounts();
  const address = account.address;

  // Create signing client
  const signingClient = await SigningStargateClient.connectWithSigner(
    config.rpcEndpoint,
    wallet,
    {
      gasPrice: GasPrice.fromString(DEFAULT_GAS_PRICE),
    }
  );

  return {
    address,
    signingClient,
    disconnect() {
      signingClient.disconnect();
    },
  };
}

/**
 * Calculate fee based on gas estimate
 */
export function calculateTxFee(
  gasEstimate: number,
  feeConfig?: FeeConfig
): StdFee {
  const gasPrice = GasPrice.fromString(
    feeConfig?.gasPrice ?? DEFAULT_GAS_PRICE
  );
  const gasAdjustment = feeConfig?.gasAdjustment ?? DEFAULT_GAS_ADJUSTMENT;
  const adjustedGas = Math.ceil(gasEstimate * gasAdjustment);

  return calculateFee(adjustedGas, gasPrice);
}
