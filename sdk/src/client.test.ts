import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type XYZClient } from "./client.js";

describe("createClient", () => {
  let client: XYZClient | undefined;

  // This test requires a running local node
  // Skip in CI if no node available
  beforeAll(async () => {
    try {
      client = await createClient({
        rpcEndpoint: "http://localhost:26657",
      });
    } catch {
      // Node not running - tests will be skipped
    }
  });

  afterAll(() => {
    client?.disconnect();
  });

  it("should connect to local node and get chain id", async () => {
    if (!client) {
      console.log("Skipping: local node not running");
      return;
    }
    const chainId = await client.getChainId();
    expect(chainId).toBe("xyz-testnet-1");
  });

  it("should get current block height", async () => {
    if (!client) {
      console.log("Skipping: local node not running");
      return;
    }
    const height = await client.getHeight();
    expect(height).toBeGreaterThan(0);
  });

  it("should have correct default config", async () => {
    if (!client) {
      console.log("Skipping: local node not running");
      return;
    }
    expect(client.config.chainId).toBe("xyz-testnet-1");
    expect(client.config.prefix).toBe("xyz");
  });
});
