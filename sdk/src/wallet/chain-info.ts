import type { ChainInfo } from "./types.js";

/**
 * XYZ Chain info for wallet registration
 * Used when chain is not yet in wallet's chain registry
 */
export function getXYZChainInfo(rpcEndpoint: string, restEndpoint: string, chainId?: string): ChainInfo {
  const id = chainId ?? "xyz-1";
  const isTestnet = id.includes("testnet");
  return {
    chainId: id,
    chainName: isTestnet ? "XYZ Chain Testnet" : "XYZ Chain",
    rpc: rpcEndpoint,
    rest: restEndpoint,
    bip44: { coinType: 118 }, // Cosmos coin type
    bech32Config: {
      bech32PrefixAccAddr: "xyz",
      bech32PrefixAccPub: "xyzpub",
      bech32PrefixValAddr: "xyzvaloper",
      bech32PrefixValPub: "xyzvaloperpub",
      bech32PrefixConsAddr: "xyzvalcons",
      bech32PrefixConsPub: "xyzvalconspub",
    },
    currencies: [
      {
        coinDenom: "XYZ",
        coinMinimalDenom: "uxyz",
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: "XYZ",
        coinMinimalDenom: "uxyz",
        coinDecimals: 6,
        gasPriceStep: {
          low: 0.01,
          average: 0.025,
          high: 0.04,
        },
      },
    ],
    stakeCurrency: {
      coinDenom: "XYZ",
      coinMinimalDenom: "uxyz",
      coinDecimals: 6,
    },
  };
}
