import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { GasPrice } from "@cosmjs/stargate";
import type { XYZChainConfig } from "../types/chain.js";
import type { ContractMsg, ExecuteOptions, ExecuteResult } from "../types/contract.js";
import type { WalletConnection } from "../wallet/types.js";
import { calculateTxFee } from "../transactions/signing.js";

/**
 * Create a signing CosmWasm client from wallet connection
 */
export async function createContractClient(
  config: XYZChainConfig,
  wallet: WalletConnection
): Promise<SigningCosmWasmClient> {
  return SigningCosmWasmClient.connectWithSigner(
    config.rpcEndpoint,
    wallet.signer,
    {
      gasPrice: GasPrice.fromString("0.025uxyz"),
    }
  );
}

/**
 * Execute a smart contract method
 * @param contractClient - Signing CosmWasm client
 * @param senderAddress - Sender address (from wallet)
 * @param contractAddress - Contract address
 * @param msg - Execute message
 * @param options - Fee and memo options
 */
export async function executeContract(
  contractClient: SigningCosmWasmClient,
  senderAddress: string,
  contractAddress: string,
  msg: ContractMsg,
  options?: ExecuteOptions
): Promise<ExecuteResult> {
  // Simulate for gas estimate
  let fee;
  if (!options?.gas || options.gas === "auto") {
    const gasEstimate = await contractClient.simulate(
      senderAddress,
      [
        {
          typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
          value: {
            sender: senderAddress,
            contract: contractAddress,
            msg: new TextEncoder().encode(JSON.stringify(msg)),
            funds: options?.funds ?? [],
          },
        },
      ],
      options?.memo
    );
    fee = calculateTxFee(gasEstimate, options);
  } else {
    fee = calculateTxFee(parseInt(options.gas, 10), options);
  }

  const result = await contractClient.execute(
    senderAddress,
    contractAddress,
    msg,
    fee,
    options?.memo,
    options?.funds
  );

  // Parse events
  const events = result.events.map((e) => ({
    type: e.type,
    attributes: e.attributes.map((a) => ({
      key: a.key,
      value: a.value,
    })),
  }));

  // Extract data from wasm events if present
  const wasmEvent = result.events.find((e) => e.type === "wasm");
  const dataAttr = wasmEvent?.attributes.find((a) => a.key === "_contract_address" || a.key === "data");
  const data = dataAttr?.value;

  return {
    transactionHash: result.transactionHash,
    height: result.height,
    gasUsed: Number(result.gasUsed),
    gasWanted: Number(result.gasWanted),
    code: 0, // Success if we got here
    events,
    data,
  };
}
