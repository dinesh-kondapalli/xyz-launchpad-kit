/**
 * XYZ Chain SDK - Node.js Example
 *
 * This script demonstrates:
 * 1. Connecting to XYZ Chain
 * 2. Querying balances
 * 3. Signing and sending transactions (with mnemonic)
 *
 * Prerequisites:
 * - XYZ Chain running locally (xyz localnet start)
 * - Test accounts with funds
 */

import {
  createClient,
  createSigningClient,
  getBalance,
  getAllBalances,
  sendXYZ,
  formatXYZ,
  getTokenInfo,
  XYZ_DENOM,
} from "@xyz-chain/sdk";

const RPC_ENDPOINT = "http://localhost:26657";

// Test mnemonic - DO NOT use in production
// This should be a genesis account mnemonic from your local setup
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

async function main() {
  console.log("XYZ Chain SDK - Node.js Example\n");
  console.log("================================\n");

  // 1. Create read-only client
  console.log("1. Connecting to XYZ Chain...");
  const client = await createClient({ rpcEndpoint: RPC_ENDPOINT });
  const chainId = await client.getChainId();
  const height = await client.getHeight();
  console.log(`   Chain ID: ${chainId}`);
  console.log(`   Block Height: ${height}\n`);

  // 2. Query balance
  console.log("2. Querying balance...");
  // Replace with actual test address
  const testAddress = "xyz1..."; // Get from: xyzd keys show alice --address
  try {
    const balance = await getBalance(client, testAddress);
    console.log(`   Address: ${testAddress}`);
    console.log(
      `   Balance: ${formatXYZ(balance.amount)} XYZ (${balance.amount} ${XYZ_DENOM})\n`
    );
  } catch (error) {
    console.log(`   Could not query balance: ${error}\n`);
  }

  // 3. Create signing client and send transaction
  console.log("3. Creating signing client...");
  try {
    const signingClient = await createSigningClient(
      { rpcEndpoint: RPC_ENDPOINT },
      TEST_MNEMONIC
    );
    console.log(`   Signer address: ${signingClient.address}\n`);

    // Get sender balance
    const senderBalance = await getBalance(client, signingClient.address);
    console.log(`   Sender balance: ${formatXYZ(senderBalance.amount)} XYZ\n`);

    // Uncomment to send a transaction:
    // const recipient = "xyz1...recipient...";
    // const result = await sendXYZ(signingClient, recipient, "1000000", {
    //   memo: "SDK test transfer",
    // });
    // console.log(`   Transaction hash: ${result.transactionHash}`);
    // console.log(`   Block height: ${result.height}`);
    // console.log(`   Gas used: ${result.gasUsed}`);

    signingClient.disconnect();
  } catch (error) {
    console.log(`   Could not create signing client: ${error}`);
    console.log("   (Make sure TEST_MNEMONIC is a valid genesis account)\n");
  }

  // Cleanup
  client.disconnect();
  console.log("Done!");
}

main().catch(console.error);
