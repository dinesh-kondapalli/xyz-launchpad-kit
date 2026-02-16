import type { WalletConnection } from "./types.js";
import { getXYZChainInfo } from "./chain-info.js";
import { isKeplrAvailable } from "./detect.js";

export interface ConnectKeplrOptions {
  chainId?: string;
  rpcEndpoint: string;
  restEndpoint?: string;
  suggestChain?: boolean; // Auto-suggest XYZ Chain if not configured (default: true)
}

/**
 * Connect to Keplr wallet
 * Prompts user to approve connection each time (no auto-reconnect)
 */
export async function connectKeplr(options: ConnectKeplrOptions): Promise<WalletConnection> {
  if (!isKeplrAvailable()) {
    throw new Error("Keplr wallet not found. Please install Keplr extension.");
  }

  const keplr = window.keplr!;
  const chainId = options.chainId ?? "xyz-1";
  const restEndpoint = options.restEndpoint ?? options.rpcEndpoint.replace(/:\d+$/, ":1317");

  // Try to suggest chain if not already configured
  if (options.suggestChain !== false) {
    try {
      const chainInfo = getXYZChainInfo(options.rpcEndpoint, restEndpoint, chainId);
      await keplr.experimentalSuggestChain(chainInfo);
    } catch (error) {
      // Chain may already be registered, continue
      console.debug("Chain suggestion failed (may already exist):", error);
    }
  }

  // Enable chain - this prompts user for approval
  await keplr.enable(chainId);

  // Get signer
  const signer = await keplr.getOfflineSignerAuto(chainId);
  const accounts = await signer.getAccounts();

  if (accounts.length === 0) {
    throw new Error("No accounts found in Keplr");
  }

  return {
    type: "keplr",
    address: accounts[0].address,
    signer,
    disconnect: () => {
      // Keplr doesn't have a disconnect method
      // Connection is per-session anyway
    },
  };
}

// Keplr icon (simplified SVG)
export const KEPLR_ICON = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="8" fill="#3B82F6"/><path d="M20 10L28 15V25L20 30L12 25V15L20 10Z" stroke="white" stroke-width="2" fill="none"/></svg>`;
