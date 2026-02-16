/**
 * Decrypt the encrypted wallet file produced by generate-wallets.ts
 *
 * Usage: npx tsx decrypt-wallets.ts [path-to-wallets.enc.json]
 *
 * Decrypted output is printed to stdout so you can pipe it where needed.
 */

import { createInterface } from "node:readline";
import { scryptSync, createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function promptPassword(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const filePath = resolve(process.argv[2] ?? "wallets.enc.json");
  const raw = readFileSync(filePath, "utf8");
  const envelope = JSON.parse(raw);

  if (envelope.v !== 1 || envelope.alg !== "aes-256-gcm") {
    console.error("Unsupported encryption format.");
    process.exit(1);
  }

  const password = await promptPassword("Enter decryption password: ");

  const salt = Buffer.from(envelope.salt, "hex");
  const iv = Buffer.from(envelope.iv, "hex");
  const authTag = Buffer.from(envelope.authTag, "hex");
  const { N, r, p } = envelope.kdfParams;

  const key = scryptSync(password, salt, 32, { N, r, p });
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted: string;
  try {
    decrypted = decipher.update(envelope.data, "hex", "utf8");
    decrypted += decipher.final("utf8");
  } catch {
    console.error("Decryption failed. Wrong password or corrupted file.");
    process.exit(1);
  }

  console.log(decrypted);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
