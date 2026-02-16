import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import type { WalletConnection } from "./types.js";

export interface ConnectDirectOptions {
  rpcEndpoint: string;
  chainId: string;
  mnemonic: string;
  prefix?: string;
}

/**
 * Connect directly via mnemonic — for development/testing only.
 * Do NOT use with real funds or production mnemonics.
 */
export async function connectDirect(
  options: ConnectDirectOptions
): Promise<WalletConnection> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
    options.mnemonic,
    { prefix: options.prefix ?? "xyz" }
  );

  const [account] = await wallet.getAccounts();

  return {
    type: "direct",
    address: account.address,
    signer: wallet,
    disconnect: () => {},
  };
}
