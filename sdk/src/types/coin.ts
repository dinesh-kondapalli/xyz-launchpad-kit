export interface Coin {
  denom: string;
  amount: string;
}

// XYZ uses 6 decimals like Solana
export const XYZ_DECIMALS = 6;
export const XYZ_DENOM = "uxyz";

export function formatXYZ(amount: string): string {
  const value = BigInt(amount);
  const whole = value / BigInt(10 ** XYZ_DECIMALS);
  const frac = value % BigInt(10 ** XYZ_DECIMALS);
  return `${whole}.${frac.toString().padStart(XYZ_DECIMALS, "0")}`;
}

export function parseXYZ(amount: string): string {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(XYZ_DECIMALS, "0").slice(0, XYZ_DECIMALS);
  return (
    BigInt(whole) * BigInt(10 ** XYZ_DECIMALS) + BigInt(fracPadded)
  ).toString();
}
