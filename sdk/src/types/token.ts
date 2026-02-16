// CW20 Token Info response
export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
}

// CW20 Balance response
export interface TokenBalance {
  balance: string;
}

// Marketing info (optional CW20 extension)
export interface TokenMarketingInfo {
  project?: string;
  description?: string;
  marketing?: string;
  logo?: TokenLogo;
}

export interface TokenLogo {
  url?: string;
  embedded?: string;
}

// Formatted token with human-readable values
export interface FormattedToken {
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  formattedTotalSupply: string;
}
