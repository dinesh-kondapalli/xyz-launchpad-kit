"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  connectKeplr,
  connectLeap,
  connectDirect,
  connectXYZ,
  createClient,
  getBalance,
  formatXYZ,
  isKeplrAvailable,
  isLeapAvailable,
  isXYZAvailable,
  type WalletConnection,
  type WalletType,
  type XYZClient,
} from "@xyz-chain/sdk";
import { RPC_ENDPOINT, REST_ENDPOINT, CHAIN_ID } from "@/lib/chain-config";

interface WalletState {
  // Persisted (only lastWalletType goes to localStorage)
  lastWalletType: WalletType | null;

  // Session state
  address: string | null;
  balance: string | null;
  balanceRaw: string | null;
  walletType: WalletType | null;
  isConnecting: boolean;
  error: string | null;

  // Non-serializable (excluded from persist via partialize)
  connection: WalletConnection | null;
  client: XYZClient | null;

  // Actions
  connect: (type: WalletType, mnemonic?: string) => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  autoReconnect: () => Promise<void>;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      // Persisted
      lastWalletType: null,

      // Session state
      address: null,
      balance: null,
      balanceRaw: null,
      walletType: null,
      isConnecting: false,
      error: null,

      // Non-serializable
      connection: null,
      client: null,

      async connect(type: WalletType, mnemonic?: string) {
        set({ isConnecting: true, error: null });

        try {
          let connection: WalletConnection;
          if (type === "direct") {
            if (!mnemonic) throw new Error("Mnemonic required for direct connect");
            connection = await connectDirect({
              rpcEndpoint: RPC_ENDPOINT,
              chainId: CHAIN_ID,
              mnemonic,
            });
          } else {
            let connectFn: typeof connectKeplr;
            if (type === "keplr") {
              connectFn = connectKeplr;
            } else if (type === "leap") {
              connectFn = connectLeap;
            } else {
              connectFn = connectXYZ;
            }
            connection = await connectFn({
              rpcEndpoint: RPC_ENDPOINT,
              restEndpoint: REST_ENDPOINT,
              chainId: CHAIN_ID,
              suggestChain: true,
            });
          }

          const client = await createClient({
            rpcEndpoint: RPC_ENDPOINT,
            restEndpoint: REST_ENDPOINT,
            chainId: CHAIN_ID,
          });

          const coin = await getBalance(client, connection.address);
          const balance = formatXYZ(coin.amount);

          set({
            connection,
            client,
            address: connection.address,
            balance,
            balanceRaw: coin.amount,
            walletType: type,
            lastWalletType: type,
            isConnecting: false,
            error: null,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to connect wallet";
          set({ isConnecting: false, error: message });
        }
      },

      disconnect() {
        const { connection, client } = get();
        connection?.disconnect();
        client?.disconnect();

        set({
          connection: null,
          client: null,
          address: null,
          balance: null,
          balanceRaw: null,
          walletType: null,
          lastWalletType: null,
          isConnecting: false,
          error: null,
        });
      },

      async refreshBalance() {
        const { client, address } = get();
        if (!client || !address) return;

        try {
          const coin = await getBalance(client, address);
          const balance = formatXYZ(coin.amount);
          set({ balance, balanceRaw: coin.amount });
        } catch (err) {
          console.error("Failed to refresh balance:", err);
        }
      },

      async autoReconnect() {
        const { lastWalletType } = get();
        if (!lastWalletType) return;

        // Direct wallets can't auto-reconnect (mnemonic not persisted for security)
        if (lastWalletType === "direct") {
          set({ lastWalletType: null });
          return;
        }

        // Give browser extensions time to inject their APIs
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Verify the extension is actually available before attempting
        let isAvailable: boolean;
        if (lastWalletType === "keplr") {
          isAvailable = isKeplrAvailable();
        } else if (lastWalletType === "leap") {
          isAvailable = isLeapAvailable();
        } else {
          isAvailable = isXYZAvailable();
        }

        if (!isAvailable) {
          // Extension not ready -- clear persisted type to avoid reconnect loop
          set({ lastWalletType: null });
          return;
        }

        try {
          await get().connect(lastWalletType);
        } catch {
          // Silent fail on auto-reconnect -- clear to avoid loop
          set({ lastWalletType: null });
        }
      },
    }),
    {
      name: "xyz-wallet",
      partialize: (state) => ({ lastWalletType: state.lastWalletType }),
    }
  )
);
