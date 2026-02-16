import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type XYZClient } from "../client.js";
import {
  getTokenInfo,
  getTokenBalance,
  getTokenMarketingInfo,
  getFormattedTokenInfo,
} from "./token.js";

describe("token queries", () => {
  let client: XYZClient | null = null;
  // CW20 contract address - set when CW20 is deployed on localnet
  const testTokenContract = "";
  const testAddress = "xyz1cyyzpxplxdzkeea7kwsydadg87357qnalx9dqz";

  beforeAll(async () => {
    try {
      client = await createClient({
        rpcEndpoint: "http://localhost:26657",
      });
    } catch {
      // Node not running
      client = null;
    }
  });

  afterAll(() => {
    client?.disconnect();
  });

  it("should get token info", async () => {
    if (!client || !testTokenContract) {
      console.log("Skipping: local node not running or no test token");
      return;
    }

    const info = await getTokenInfo(client, testTokenContract);
    expect(info.name).toBeDefined();
    expect(typeof info.name).toBe("string");
    expect(info.symbol).toBeDefined();
    expect(typeof info.symbol).toBe("string");
    expect(typeof info.decimals).toBe("number");
    expect(info.decimals).toBeGreaterThanOrEqual(0);
    expect(info.total_supply).toBeDefined();
  });

  it("should get token balance", async () => {
    if (!client || !testTokenContract) {
      console.log("Skipping: local node not running or no test token");
      return;
    }

    const balance = await getTokenBalance(client, testTokenContract, testAddress);
    expect(typeof balance).toBe("string");
    expect(BigInt(balance)).toBeGreaterThanOrEqual(0n);
  });

  it("should get token marketing info or null", async () => {
    if (!client || !testTokenContract) {
      console.log("Skipping: local node not running or no test token");
      return;
    }

    const marketing = await getTokenMarketingInfo(client, testTokenContract);
    // Marketing info is optional, can be null
    if (marketing !== null) {
      expect(typeof marketing).toBe("object");
    }
  });

  it("should get formatted token info", async () => {
    if (!client || !testTokenContract) {
      console.log("Skipping: local node not running or no test token");
      return;
    }

    const formatted = await getFormattedTokenInfo(client, testTokenContract);
    expect(formatted.contractAddress).toBe(testTokenContract);
    expect(formatted.name).toBeDefined();
    expect(formatted.symbol).toBeDefined();
    expect(typeof formatted.decimals).toBe("number");
    expect(formatted.totalSupply).toBeDefined();
    expect(formatted.formattedTotalSupply).toBeDefined();
    // Formatted supply should contain a decimal point
    expect(formatted.formattedTotalSupply).toContain(".");
  });
});
