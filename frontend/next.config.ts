import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@xyz-chain/sdk"],
  async rewrites() {
    const RPC_DEST = process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "http://67.205.164.156:26657";
    const REST_DEST = process.env.NEXT_PUBLIC_REST_ENDPOINT ?? "http://67.205.164.156:1317";
    return [
      { source: "/rpc", destination: RPC_DEST },
      { source: "/rpc/:path*", destination: `${RPC_DEST}/:path*` },
      { source: "/rest/:path*", destination: `${REST_DEST}/:path*` },
    ];
  },
};

export default nextConfig;
