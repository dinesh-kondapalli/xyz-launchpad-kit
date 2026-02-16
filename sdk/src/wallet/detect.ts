import type { WalletType } from "./types.js";

export function isKeplrAvailable(): boolean {
  return typeof window !== "undefined" && !!window.keplr;
}

export function isLeapAvailable(): boolean {
  return typeof window !== "undefined" && !!window.leap;
}

export function isXYZAvailable(): boolean {
  return typeof window !== "undefined" && !!window.xyz;
}

export function getAvailableWallets(): WalletType[] {
  const wallets: WalletType[] = [];
  if (isKeplrAvailable()) wallets.push("keplr");
  if (isLeapAvailable()) wallets.push("leap");
  if (isXYZAvailable()) wallets.push("xyz");
  return wallets;
}
