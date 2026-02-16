/**
 * Bulk Wallet Generator for XYZ Chain
 *
 * Generates multiple wallets with unique BIP39 mnemonics and saves them
 * to an AES-256-GCM encrypted JSON file protected by a user password.
 *
 * Usage: npx tsx generate-wallets.ts
 *
 * Security:
 * - Mnemonics are NEVER printed to stdout
 * - Output file is encrypted with AES-256-GCM
 * - Key derivation uses scrypt (N=2^20, r=8, p=1)
 * - Only addresses are shown on screen
 */

import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { createInterface } from "node:readline";
import { scryptSync, randomBytes, createCipheriv } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WALLET_COUNT = 20;
const ADDRESS_PREFIX = "xyz";

interface WalletEntry {
  index: number;
  address: string;
  mnemonic: string;
}

async function promptPassword(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function encrypt(plaintext: string, password: string): string {
  const salt = randomBytes(32);
  const key = scryptSync(password, salt, 32, { N: 2 ** 20, r: 8, p: 1 });
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    v: 1,
    alg: "aes-256-gcm",
    kdf: "scrypt",
    kdfParams: { N: 2 ** 20, r: 8, p: 1 },
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    data: encrypted,
  });
}

async function generateWallet(index: number): Promise<WalletEntry> {
  const wallet = await DirectSecp256k1HdWallet.generate(24, {
    prefix: ADDRESS_PREFIX,
  });
  const [account] = await wallet.getAccounts();
  return {
    index,
    address: account.address,
    mnemonic: wallet.mnemonic,
  };
}

async function main() {
  console.log(`\nGenerating ${WALLET_COUNT} XYZ wallets...\n`);

  // Generate all wallets concurrently
  const wallets = await Promise.all(
    Array.from({ length: WALLET_COUNT }, (_, i) => generateWallet(i + 1))
  );

  // Display addresses only (never mnemonics)
  console.log("Generated addresses:");
  console.log("--------------------");
  for (const w of wallets) {
    console.log(`  ${String(w.index).padStart(2, " ")}. ${w.address}`);
  }
  console.log();

  // Prompt for encryption password
  const password = await promptPassword("Enter encryption password: ");
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  const confirm = await promptPassword("Confirm password: ");
  if (password !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  // Encrypt and write to file
  const payload = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      count: wallets.length,
      prefix: ADDRESS_PREFIX,
      wallets: wallets.map(({ index, address, mnemonic }) => ({
        index,
        address,
        mnemonic,
      })),
    },
    null,
    2
  );

  const encrypted = encrypt(payload, password);
  const outPath = resolve("wallets.enc.json");
  writeFileSync(outPath, encrypted, "utf8");

  console.log(`\nEncrypted wallet file written to: ${outPath}`);
  console.log(
    "Keep this file safe. You will need your password to decrypt it.\n"
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
