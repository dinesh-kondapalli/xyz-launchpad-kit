// Use local proxy paths in the browser to avoid CORS issues
export const RPC_ENDPOINT =
  typeof window !== "undefined"
    ? `${window.location.origin}/rpc`
    : (process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "http://67.205.164.156:26657");

export const REST_ENDPOINT =
  typeof window !== "undefined"
    ? `${window.location.origin}/rest`
    : (process.env.NEXT_PUBLIC_REST_ENDPOINT ?? "http://67.205.164.156:1317");

export const CHAIN_ID =
  process.env.NEXT_PUBLIC_CHAIN_ID ?? "xyz-1";

export const DEFAULT_TOKEN_SUPPLY = 100_000_000;
