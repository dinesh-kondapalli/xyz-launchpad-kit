import type { WalletConnection } from "./types.js";
import { getXYZChainInfo } from "./chain-info.js";
import { isXYZAvailable } from "./detect.js";

export interface ConnectXYZOptions {
  chainId?: string;
  rpcEndpoint: string;
  restEndpoint?: string;
  suggestChain?: boolean; // Auto-suggest XYZ Chain if not configured (default: true)
}

/**
 * Connect to XYZ Wallet
 * Prompts user to approve connection each time (no auto-reconnect)
 */
export async function connectXYZ(options: ConnectXYZOptions): Promise<WalletConnection> {
  if (!isXYZAvailable()) {
    throw new Error("XYZ Wallet not found. Please install the XYZ Wallet extension.");
  }

  const xyz = window.xyz!;
  const chainId = options.chainId ?? "xyz-1";
  const restEndpoint = options.restEndpoint ?? options.rpcEndpoint.replace(/:\d+$/, ":1317");

  // Try to suggest chain if not already configured
  if (options.suggestChain !== false) {
    try {
      const chainInfo = getXYZChainInfo(options.rpcEndpoint, restEndpoint, chainId);
      await xyz.experimentalSuggestChain(chainInfo);
    } catch (error) {
      // Chain may already be registered, continue
      console.debug("Chain suggestion failed (may already exist):", error);
    }
  }

  // Enable chain - this prompts user for approval
  await xyz.enable(chainId);

  // Get signer
  const signer = await xyz.getOfflineSignerAuto(chainId);
  const accounts = await signer.getAccounts();

  if (accounts.length === 0) {
    throw new Error("No accounts found in XYZ Wallet");
  }

  return {
    type: "xyz",
    address: accounts[0].address,
    signer,
    disconnect: () => {
      // XYZ Wallet doesn't have a disconnect method
      // Connection is per-session anyway
    },
  };
}

// XYZ Wallet icon - electric blue (#0066FF) brand color
export const XYZ_ICON = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="8" fill="#0066FF"/><text x="20" y="26" text-anchor="middle" fill="white" font-family="system-ui" font-weight="700" font-size="16">XYZ</text></svg>`;
