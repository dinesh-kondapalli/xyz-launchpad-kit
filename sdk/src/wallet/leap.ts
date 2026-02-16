import type { WalletConnection } from "./types.js";
import { getXYZChainInfo } from "./chain-info.js";
import { isLeapAvailable } from "./detect.js";

export interface ConnectLeapOptions {
  chainId?: string;
  rpcEndpoint: string;
  restEndpoint?: string;
  suggestChain?: boolean;
}

/**
 * Connect to Leap wallet
 * Prompts user to approve connection each time (no auto-reconnect)
 */
export async function connectLeap(options: ConnectLeapOptions): Promise<WalletConnection> {
  if (!isLeapAvailable()) {
    throw new Error("Leap wallet not found. Please install Leap extension.");
  }

  const leap = window.leap!;
  const chainId = options.chainId ?? "xyz-1";
  const restEndpoint = options.restEndpoint ?? options.rpcEndpoint.replace(/:\d+$/, ":1317");

  // Try to suggest chain if not already configured
  if (options.suggestChain !== false) {
    try {
      const chainInfo = getXYZChainInfo(options.rpcEndpoint, restEndpoint, chainId);
      await leap.experimentalSuggestChain(chainInfo);
    } catch (error) {
      console.debug("Chain suggestion failed (may already exist):", error);
    }
  }

  // Enable chain - this prompts user for approval
  await leap.enable(chainId);

  // Get signer
  const signer = await leap.getOfflineSignerAuto(chainId);
  const accounts = await signer.getAccounts();

  if (accounts.length === 0) {
    throw new Error("No accounts found in Leap");
  }

  return {
    type: "leap",
    address: accounts[0].address,
    signer,
    disconnect: () => {
      // Leap doesn't have a disconnect method
    },
  };
}

// Leap icon (simplified SVG)
export const LEAP_ICON = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="8" fill="#29A874"/><path d="M15 25L20 15L25 25" stroke="white" stroke-width="2" fill="none"/></svg>`;
