export interface XYZChainConfig {
  rpcEndpoint: string;
  restEndpoint?: string;
  chainId?: string; // defaults to "xyz-1"
  prefix?: string; // defaults to "xyz"
}

export const DEFAULT_CONFIG: Partial<XYZChainConfig> = {
  chainId: "xyz-1",
  prefix: "xyz",
};
