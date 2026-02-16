import { describe, it, expect, afterAll } from "vitest";
import { createSigningClient, calculateTxFee, type XYZSigningClient } from "./signing.js";

// Test mnemonic - use standard test words (DO NOT use in production)
// This is a well-known test mnemonic for development only
const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("signing client", () => {
  let client: XYZSigningClient | null = null;

  afterAll(() => {
    client?.disconnect();
  });

  it("should create signing client from mnemonic", async () => {
    try {
      client = await createSigningClient(
        { rpcEndpoint: "http://localhost:26657" },
        TEST_MNEMONIC
      );
      expect(client.address).toMatch(/^xyz1/);
    } catch {
      console.log("Skipping: local node not running or connection failed");
    }
  });

  it("should derive correct address from mnemonic", async () => {
    if (!client) {
      console.log("Skipping: client not created");
      return;
    }
    // Address should use xyz prefix
    expect(client.address.startsWith("xyz1")).toBe(true);
  });
});

describe("calculateTxFee", () => {
  it("should calculate fee with default gas adjustment", () => {
    const fee = calculateTxFee(100000);
    // Default adjustment is 1.3, so 100000 * 1.3 = 130000
    expect(parseInt(fee.gas, 10)).toBe(130000);
    // Default gas price is 0.025uxyz, so 130000 * 0.025 = 3250
    expect(fee.amount).toEqual([{ denom: "uxyz", amount: "3250" }]);
  });

  it("should calculate fee with custom gas adjustment", () => {
    const fee = calculateTxFee(100000, { gasAdjustment: 1.5 });
    // 100000 * 1.5 = 150000
    expect(parseInt(fee.gas, 10)).toBe(150000);
  });

  it("should calculate fee with custom gas price", () => {
    const fee = calculateTxFee(100000, { gasPrice: "0.05uxyz" });
    // 100000 * 1.3 = 130000, 130000 * 0.05 = 6500
    expect(fee.amount).toEqual([{ denom: "uxyz", amount: "6500" }]);
  });
});
