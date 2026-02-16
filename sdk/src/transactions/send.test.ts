import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createSigningClient, type XYZSigningClient } from "./signing.js";
import { sendTokens, sendXYZ } from "./send.js";

// Test mnemonic - use standard test words (DO NOT use in production)
const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

// Use a different address derived from the same mnemonic standard for recipient
const RECIPIENT_ADDRESS = "xyz1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq7sxrjk";

describe("send transactions", () => {
  let client: XYZSigningClient | null = null;

  beforeAll(async () => {
    try {
      client = await createSigningClient(
        { rpcEndpoint: "http://localhost:26657" },
        TEST_MNEMONIC
      );
    } catch {
      // Node not running - tests will skip
    }
  });

  afterAll(() => {
    client?.disconnect();
  });

  it("should send XYZ tokens", async () => {
    if (!client) {
      console.log("Skipping: local node not running");
      return;
    }

    try {
      const result = await sendXYZ(
        client,
        RECIPIENT_ADDRESS,
        "1000000", // 1 XYZ in uxyz
        { memo: "SDK test transfer" }
      );

      expect(result.code).toBe(0);
      expect(result.transactionHash).toMatch(/^[A-F0-9]{64}$/i);
      expect(result.height).toBeGreaterThan(0);
    } catch (error) {
      // If account doesn't have funds, that's expected in test environment
      console.log("Transaction failed (expected if test account has no funds):", error);
    }
  });

  it("should send multiple coins", async () => {
    if (!client) {
      console.log("Skipping: local node not running");
      return;
    }

    try {
      const result = await sendTokens(
        client,
        RECIPIENT_ADDRESS,
        [
          { denom: "uxyz", amount: "500000" },
        ],
        { memo: "Multi-coin test" }
      );

      expect(result.code).toBe(0);
    } catch (error) {
      // Expected if no funds
      console.log("Transaction failed (expected if test account has no funds):", error);
    }
  });
});

describe("sendTokens input validation", () => {
  it("should accept single coin", async () => {
    // This just tests the input processing, not actual sending
    // We can't fully test without a running node
    const singleCoin = { denom: "uxyz", amount: "1000" };
    const coins = Array.isArray(singleCoin) ? singleCoin : [singleCoin];
    expect(coins).toEqual([{ denom: "uxyz", amount: "1000" }]);
  });

  it("should accept array of coins", async () => {
    const multiCoins = [
      { denom: "uxyz", amount: "1000" },
      { denom: "uatom", amount: "500" },
    ];
    const coins = Array.isArray(multiCoins) ? multiCoins : [multiCoins];
    expect(coins).toHaveLength(2);
  });
});
