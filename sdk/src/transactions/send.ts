import type { Coin } from "../types/coin.js";
import type { SendOptions, TxResult } from "../types/transaction.js";
import { toTxResult } from "../types/transaction.js";
import type { XYZSigningClient } from "./signing.js";
import { calculateTxFee } from "./signing.js";

/**
 * Send native tokens to an address
 */
export async function sendTokens(
  client: XYZSigningClient,
  recipient: string,
  amount: Coin | Coin[],
  options?: SendOptions
): Promise<TxResult> {
  const coins = Array.isArray(amount) ? amount : [amount];

  // Simulate to get gas estimate if not provided
  let fee;
  if (options?.gas === "auto" || !options?.gas) {
    const gasEstimate = await client.signingClient.simulate(
      client.address,
      [
        {
          typeUrl: "/cosmos.bank.v1beta1.MsgSend",
          value: {
            fromAddress: client.address,
            toAddress: recipient,
            amount: coins,
          },
        },
      ],
      options?.memo
    );
    fee = calculateTxFee(gasEstimate, options);
  } else {
    fee = calculateTxFee(parseInt(options.gas, 10), options);
  }

  const result = await client.signingClient.sendTokens(
    client.address,
    recipient,
    coins,
    fee,
    options?.memo
  );

  return toTxResult(result);
}

/**
 * Send native XYZ tokens (convenience function)
 */
export async function sendXYZ(
  client: XYZSigningClient,
  recipient: string,
  amount: string,
  options?: SendOptions
): Promise<TxResult> {
  return sendTokens(
    client,
    recipient,
    { denom: "uxyz", amount },
    options
  );
}
