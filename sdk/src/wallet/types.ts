import type { OfflineSigner, OfflineDirectSigner } from "@cosmjs/proto-signing";

export type WalletType = "keplr" | "leap" | "direct" | "xyz";

export interface WalletConnection {
  type: WalletType;
  address: string;
  signer: OfflineSigner | OfflineDirectSigner;
  disconnect: () => void;
}

export interface WalletProvider {
  type: WalletType;
  name: string;
  icon: string; // SVG string or data URL
  isAvailable: () => boolean;
  connect: (chainId: string) => Promise<WalletConnection>;
}

// Keplr/Leap window augmentation
declare global {
  interface Window {
    keplr?: {
      enable: (chainId: string) => Promise<void>;
      getOfflineSigner: (chainId: string) => OfflineSigner;
      getOfflineSignerAuto: (chainId: string) => Promise<OfflineSigner | OfflineDirectSigner>;
      experimentalSuggestChain: (chainInfo: ChainInfo) => Promise<void>;
    };
    leap?: {
      enable: (chainId: string) => Promise<void>;
      getOfflineSigner: (chainId: string) => OfflineSigner;
      getOfflineSignerAuto: (chainId: string) => Promise<OfflineSigner | OfflineDirectSigner>;
      experimentalSuggestChain: (chainInfo: ChainInfo) => Promise<void>;
    };
    xyz?: {
      enable: (chainId: string) => Promise<void>;
      getOfflineSigner: (chainId: string) => OfflineSigner;
      getOfflineSignerAuto: (chainId: string) => Promise<OfflineSigner | OfflineDirectSigner>;
      experimentalSuggestChain: (chainInfo: ChainInfo) => Promise<void>;
      isXYZ: true;
    };
  }
}

// Chain info for wallet registration
export interface ChainInfo {
  chainId: string;
  chainName: string;
  rpc: string;
  rest: string;
  bip44: { coinType: number };
  bech32Config: {
    bech32PrefixAccAddr: string;
    bech32PrefixAccPub: string;
    bech32PrefixValAddr: string;
    bech32PrefixValPub: string;
    bech32PrefixConsAddr: string;
    bech32PrefixConsPub: string;
  };
  currencies: Array<{
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
  }>;
  feeCurrencies: Array<{
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
    gasPriceStep?: {
      low: number;
      average: number;
      high: number;
    };
  }>;
  stakeCurrency: {
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
  };
}
